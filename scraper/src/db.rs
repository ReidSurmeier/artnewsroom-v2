use anyhow::{Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

use crate::extract::ExtractedArticle;
use crate::feeds::FeedEntry;
use crate::sources::SourceDef;

pub fn db_path() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("../data/newsroom.db");
    p
}

pub fn open_db(path: &PathBuf) -> Result<Connection> {
    let conn = Connection::open(path).context("Failed to open database")?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

pub fn init_db(path: &PathBuf) -> Result<Connection> {
    // Ensure parent dir exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = open_db(path)?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL,
            feed_url TEXT,
            tier INTEGER NOT NULL DEFAULT 2,
            scrape_method TEXT NOT NULL DEFAULT 'rss',
            is_paywalled INTEGER DEFAULT 0,
            last_fetched TEXT,
            fetch_count INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            enabled INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            source TEXT NOT NULL,
            source_url TEXT,
            author TEXT,
            published_at TEXT,
            discovered_at TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            score_breakdown TEXT,
            promoted INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS articles (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            source TEXT NOT NULL,
            source_url TEXT,
            author TEXT,
            published_at TEXT,
            scraped_at TEXT NOT NULL,
            content_html TEXT,
            content_markdown TEXT,
            excerpt TEXT,
            image_url TEXT,
            score INTEGER DEFAULT 0,
            score_breakdown TEXT,
            word_count INTEGER DEFAULT 0,
            is_read INTEGER DEFAULT 0,
            is_saved INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            quality_score REAL DEFAULT 0.0,
            date_added TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id TEXT NOT NULL,
            highlighted_text TEXT NOT NULL,
            note_text TEXT DEFAULT '',
            start_offset INTEGER NOT NULL,
            end_offset INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            anchor_prefix TEXT DEFAULT '',
            anchor_suffix TEXT DEFAULT '',
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scan_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            sources_scanned INTEGER DEFAULT 0,
            candidates_found INTEGER DEFAULT 0,
            articles_promoted INTEGER DEFAULT 0,
            errors TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date_added);
        CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
        CREATE INDEX IF NOT EXISTS idx_articles_archived ON articles(is_archived);
        CREATE INDEX IF NOT EXISTS idx_candidates_url ON candidates(url);
        CREATE INDEX IF NOT EXISTS idx_candidates_promoted ON candidates(promoted);
        CREATE INDEX IF NOT EXISTS idx_annotations_article ON annotations(article_id);
        ",
    )?;

    Ok(conn)
}

pub fn seed_sources(conn: &Connection, sources: &[SourceDef]) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT OR REPLACE INTO sources (name, url, feed_url, tier, scrape_method, is_paywalled, enabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?;
    for s in sources {
        stmt.execute(params![
            s.name,
            s.url,
            s.feed_url,
            s.tier,
            s.scrape_method,
            s.is_paywalled as i32,
            s.enabled as i32,
        ])?;
    }
    eprintln!("Seeded {} sources", sources.len());
    Ok(())
}

#[derive(Debug)]
pub struct DbSource {
    pub name: String,
    pub url: String,
    pub feed_url: Option<String>,
    pub tier: i32,
    pub scrape_method: String,
    pub is_paywalled: bool,
}

pub fn get_enabled_sources(conn: &Connection) -> Result<Vec<DbSource>> {
    let mut stmt = conn.prepare(
        "SELECT name, url, feed_url, tier, scrape_method, is_paywalled FROM sources WHERE enabled=1",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbSource {
            name: row.get(0)?,
            url: row.get(1)?,
            feed_url: row.get(2)?,
            tier: row.get(3)?,
            scrape_method: row.get(4)?,
            is_paywalled: row.get::<_, i32>(5)? != 0,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn insert_candidate(
    conn: &Connection,
    entry: &FeedEntry,
    source_name: &str,
    score: i32,
    breakdown: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO candidates (title, url, source, source_url, author, published_at, discovered_at, score, score_breakdown)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            entry.title,
            entry.url,
            source_name,
            entry.source_url,
            entry.author,
            entry.published_at,
            Utc::now().to_rfc3339(),
            score,
            breakdown,
        ],
    )?;
    Ok(())
}

pub fn update_source_fetched(conn: &Connection, name: &str, had_error: bool) -> Result<()> {
    if had_error {
        conn.execute(
            "UPDATE sources SET last_fetched=?1, error_count=error_count+1 WHERE name=?2",
            params![Utc::now().to_rfc3339(), name],
        )?;
    } else {
        conn.execute(
            "UPDATE sources SET last_fetched=?1, fetch_count=fetch_count+1 WHERE name=?2",
            params![Utc::now().to_rfc3339(), name],
        )?;
    }
    Ok(())
}

pub fn start_scan_log(conn: &Connection) -> Result<i64> {
    conn.execute(
        "INSERT INTO scan_logs (started_at) VALUES (?1)",
        params![Utc::now().to_rfc3339()],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn finish_scan_log(
    conn: &Connection,
    id: i64,
    sources: i32,
    candidates: i32,
    promoted: i32,
    errors: &[String],
) -> Result<()> {
    let err_json = serde_json::to_string(errors)?;
    conn.execute(
        "UPDATE scan_logs SET finished_at=?1, sources_scanned=?2, candidates_found=?3, articles_promoted=?4, errors=?5 WHERE id=?6",
        params![Utc::now().to_rfc3339(), sources, candidates, promoted, err_json, id],
    )?;
    Ok(())
}

#[derive(Debug)]
pub struct CandidateRow {
    pub id: i64,
    pub title: String,
    pub url: String,
    pub source: String,
    pub source_url: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub score: i32,
    pub score_breakdown: Option<String>,
}

pub fn get_promotable_candidates(conn: &Connection, min_score: i32) -> Result<Vec<CandidateRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, url, source, source_url, author, published_at, score, score_breakdown
         FROM candidates WHERE promoted=0 AND score >= ?1 ORDER BY score DESC",
    )?;
    let rows = stmt.query_map(params![min_score], |row| {
        Ok(CandidateRow {
            id: row.get(0)?,
            title: row.get(1)?,
            url: row.get(2)?,
            source: row.get(3)?,
            source_url: row.get(4)?,
            author: row.get(5)?,
            published_at: row.get(6)?,
            score: row.get(7)?,
            score_breakdown: row.get(8)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn article_id(url: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    hex::encode(&hasher.finalize()[..8])
}

pub fn insert_article(conn: &Connection, cand: &CandidateRow, extracted: &ExtractedArticle) -> Result<()> {
    let id = article_id(&cand.url);
    let now = Utc::now().to_rfc3339();
    let excerpt = if extracted.content_markdown.len() > 300 {
        format!("{}...", &extracted.content_markdown[..300])
    } else {
        extracted.content_markdown.clone()
    };

    conn.execute(
        "INSERT INTO articles (id, title, url, source, source_url, author, published_at, scraped_at,
            content_html, content_markdown, excerpt, image_url, score, score_breakdown,
            word_count, is_read, is_saved, is_archived, quality_score, date_added)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,0,0,0,0.0,?16)",
        params![
            id,
            extracted.title.as_deref().unwrap_or(&cand.title),
            cand.url,
            cand.source,
            cand.source_url,
            extracted.author.as_deref().or(cand.author.as_deref()),
            cand.published_at,
            now,
            extracted.content_html,
            extracted.content_markdown,
            excerpt,
            extracted.image_url,
            cand.score,
            cand.score_breakdown,
            extracted.word_count as i32,
            now,
        ],
    )?;
    Ok(())
}

pub fn mark_promoted(conn: &Connection, candidate_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE candidates SET promoted=1 WHERE id=?1",
        params![candidate_id],
    )?;
    Ok(())
}

pub fn auto_archive_old(conn: &Connection, days: i32) -> Result<usize> {
    let cutoff = (Utc::now() - chrono::Duration::days(days as i64)).to_rfc3339();
    let changed = conn.execute(
        "UPDATE articles SET is_archived=1 WHERE date_added < ?1 AND is_archived=0 AND is_saved=0",
        params![cutoff],
    )?;
    Ok(changed)
}

// URL existence check for dedup
pub fn url_exists_in_candidates(conn: &Connection, url: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM candidates WHERE url=?1",
        params![url],
        |row| row.get::<_, i32>(0),
    )
    .map(|c| c > 0)
    .unwrap_or(false)
}

pub fn url_exists_in_articles(conn: &Connection, url: &str) -> bool {
    conn.query_row(
        "SELECT COUNT(*) FROM articles WHERE url=?1",
        params![url],
        |row| row.get::<_, i32>(0),
    )
    .map(|c| c > 0)
    .unwrap_or(false)
}

pub fn get_recent_titles(conn: &Connection, limit: i32) -> Vec<String> {
    let mut stmt = match conn.prepare(
        "SELECT title FROM candidates ORDER BY id DESC LIMIT ?1",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map(params![limit], |row| row.get::<_, String>(0)) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

pub struct DbStats {
    pub sources_total: i32,
    pub sources_enabled: i32,
    pub candidates_total: i32,
    pub candidates_promoted: i32,
    pub articles_total: i32,
    pub articles_archived: i32,
    pub articles_saved: i32,
    pub last_scan: Option<ScanLogRow>,
}

pub struct ScanLogRow {
    pub finished_at: String,
    pub candidates_found: i32,
    pub errors: String,
}

pub fn get_stats(conn: &Connection) -> Result<DbStats> {
    let sources_total: i32 =
        conn.query_row("SELECT COUNT(*) FROM sources", [], |r| r.get(0))?;
    let sources_enabled: i32 =
        conn.query_row("SELECT COUNT(*) FROM sources WHERE enabled=1", [], |r| r.get(0))?;
    let candidates_total: i32 =
        conn.query_row("SELECT COUNT(*) FROM candidates", [], |r| r.get(0))?;
    let candidates_promoted: i32 =
        conn.query_row("SELECT COUNT(*) FROM candidates WHERE promoted=1", [], |r| r.get(0))?;
    let articles_total: i32 =
        conn.query_row("SELECT COUNT(*) FROM articles", [], |r| r.get(0))?;
    let articles_archived: i32 =
        conn.query_row("SELECT COUNT(*) FROM articles WHERE is_archived=1", [], |r| r.get(0))?;
    let articles_saved: i32 =
        conn.query_row("SELECT COUNT(*) FROM articles WHERE is_saved=1", [], |r| r.get(0))?;

    let last_scan = conn
        .query_row(
            "SELECT finished_at, candidates_found, errors FROM scan_logs ORDER BY id DESC LIMIT 1",
            [],
            |row| {
                Ok(ScanLogRow {
                    finished_at: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    candidates_found: row.get(1)?,
                    errors: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                })
            },
        )
        .ok();

    Ok(DbStats {
        sources_total,
        sources_enabled,
        candidates_total,
        candidates_promoted,
        articles_total,
        articles_archived,
        articles_saved,
        last_scan,
    })
}
