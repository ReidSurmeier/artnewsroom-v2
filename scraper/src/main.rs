mod db;
mod dedup;
mod extract;
mod feeds;
mod images;
mod quality;
mod score;
mod sources;

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "newsroom", about = "Art newsroom article scraper")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create SQLite database with all tables
    InitDb,
    /// Fetch RSS/Atom feeds, score candidates, store in DB
    Scan,
    /// Promote top candidates to articles by extracting full content
    Promote,
    /// Scan then promote in sequence (for systemd timer)
    ScanAndPromote,
    /// List configured sources
    Sources,
    /// Show DB statistics
    Stats,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let db_path = db::db_path();

    match cli.command {
        Commands::InitDb => {
            let conn = db::init_db(&db_path)?;
            db::seed_sources(&conn, &sources::all_sources())?;
            eprintln!("Database created at {}", db_path.display());
        }
        Commands::Scan => {
            let conn = db::open_db(&db_path)?;
            cmd_scan(&conn)?;
        }
        Commands::Promote => {
            let conn = db::open_db(&db_path)?;
            cmd_promote(&conn)?;
        }
        Commands::ScanAndPromote => {
            let conn = db::open_db(&db_path)?;
            cmd_scan(&conn)?;
            cmd_promote(&conn)?;
        }
        Commands::Sources => {
            let srcs = sources::all_sources();
            println!("{:<35} {:<5} {:<8} {}", "Name", "Tier", "Method", "Feed URL");
            println!("{}", "-".repeat(100));
            for s in &srcs {
                println!(
                    "{:<35} {:<5} {:<8} {}",
                    s.name,
                    s.tier,
                    s.scrape_method,
                    s.feed_url.as_deref().unwrap_or("(none)")
                );
            }
            println!("\nTotal: {} sources ({} enabled)", srcs.len(), srcs.iter().filter(|s| s.enabled).count());
        }
        Commands::Stats => {
            let conn = db::open_db(&db_path)?;
            cmd_stats(&conn)?;
        }
    }
    Ok(())
}

fn cmd_scan(conn: &rusqlite::Connection) -> Result<()> {
    let taste = score::TasteProfile::load()?;
    let sources = db::get_enabled_sources(conn)?;
    let log_id = db::start_scan_log(conn)?;
    let mut total_candidates = 0u32;
    let mut errors: Vec<String> = Vec::new();

    eprintln!("Scanning {} sources...", sources.len());

    for src in &sources {
        let feed_url = match &src.feed_url {
            Some(u) if !u.is_empty() => u.clone(),
            _ => {
                eprintln!("  [SKIP] {} — no feed URL", src.name);
                continue;
            }
        };

        eprintln!("  [SCAN] {} ...", src.name);
        match feeds::fetch_feed(&feed_url) {
            Ok(entries) => {
                let mut count = 0u32;
                for entry in entries {
                    if quality::is_non_article_title(&entry.title) {
                        continue;
                    }
                    if !quality::passes_art_relevance(&entry.title, &src.name) {
                        continue;
                    }
                    if entry.published_at.is_some() && quality::is_too_old(entry.published_at.as_deref()) {
                        continue;
                    }
                    let s = score::score_candidate(&entry, &src, &taste);
                    if s.total <= 0 {
                        continue;
                    }
                    let existing = dedup::url_exists(conn, &entry.url);
                    if existing {
                        continue;
                    }
                    if dedup::title_is_duplicate(conn, &entry.title) {
                        continue;
                    }
                    match db::insert_candidate(conn, &entry, &src.name, s.total, &s.breakdown_json()) {
                        Ok(_) => count += 1,
                        Err(e) => {
                            // Unique constraint — already exists
                            if !e.to_string().contains("UNIQUE") {
                                eprintln!("    insert error: {}", e);
                            }
                        }
                    }
                }
                db::update_source_fetched(conn, &src.name, false)?;
                total_candidates += count;
                eprintln!("    +{} candidates", count);
            }
            Err(e) => {
                let msg = format!("{}: {}", src.name, e);
                eprintln!("    [ERR] {}", msg);
                errors.push(msg);
                db::update_source_fetched(conn, &src.name, true)?;
            }
        }
    }

    db::finish_scan_log(conn, log_id, sources.len() as i32, total_candidates as i32, 0, &errors)?;
    eprintln!("Scan complete: {} candidates from {} sources ({} errors)", total_candidates, sources.len(), errors.len());
    Ok(())
}

fn cmd_promote(conn: &rusqlite::Connection) -> Result<()> {
    let candidates = db::get_promotable_candidates(conn, 40)?;
    eprintln!("Found {} candidates to promote (score >= 40)", candidates.len());

    // Diversity: max 1 article per source per promotion run
    // Walk sorted-by-score candidates, take first unseen source, target 8-15 articles
    let mut seen_sources: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut promoted = 0u32;
    let max_promote = 15u32;

    let data_dir = {
        let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.push("../data");
        p
    };

    for cand in &candidates {
        if promoted >= max_promote {
            eprintln!("  [STOP] reached {} articles, stopping", max_promote);
            break;
        }

        // Max 1 per source
        if seen_sources.contains(&cand.source) {
            eprintln!("  [SKIP] {} — already have 1 from {}", cand.title, cand.source);
            continue;
        }

        eprintln!("  [PROMOTE] {} ...", cand.title);
        match extract::extract_article(&cand.url) {
            Ok(article) => {
                if article.word_count < 200 {
                    eprintln!("    too short ({} words), skipping", article.word_count);
                    continue;
                }
                if quality::is_mostly_boilerplate(&article.content_html) {
                    eprintln!("    mostly boilerplate, skipping");
                    continue;
                }
                match db::insert_article(conn, &cand, &article) {
                    Ok(article_id) => {
                        db::mark_promoted(conn, cand.id)?;

                        // Process images from extracted HTML
                        let img_urls = images::find_image_urls(&article.content_html);
                        for (pos, img_url) in img_urls.iter().enumerate() {
                            match images::download_and_process(img_url, &article_id, pos, &data_dir) {
                                Some((ascii, bw_path)) => {
                                    let _ = db::insert_article_image(
                                        conn, &article_id, img_url, &ascii, &bw_path, "", pos as i32,
                                    );
                                    eprintln!("    [IMG] processed image {}", pos);
                                }
                                None => {
                                    eprintln!("    [IMG] failed to process {}", img_url);
                                }
                            }
                        }

                        seen_sources.insert(cand.source.clone());
                        promoted += 1;
                        eprintln!("    {} words", article.word_count);
                    }
                    Err(e) => {
                        if !e.to_string().contains("UNIQUE") {
                            eprintln!("    insert error: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("    [ERR] {}", e);
            }
        }
    }

    // Auto-archive articles older than 7 days
    let archived = db::auto_archive_old(conn, 7)?;
    if archived > 0 {
        eprintln!("Auto-archived {} articles older than 7 days", archived);
    }

    eprintln!("Promoted {} articles (from {} unique sources)", promoted, seen_sources.len());
    Ok(())
}

fn cmd_stats(conn: &rusqlite::Connection) -> Result<()> {
    let stats = db::get_stats(conn)?;
    println!("Sources:    {} total, {} enabled", stats.sources_total, stats.sources_enabled);
    println!("Candidates: {} total, {} promoted", stats.candidates_total, stats.candidates_promoted);
    println!("Articles:   {} total, {} archived, {} saved", stats.articles_total, stats.articles_archived, stats.articles_saved);
    if let Some(last) = stats.last_scan {
        println!("Last scan:  {} ({} candidates, {} errors)", last.finished_at, last.candidates_found, last.errors);
    }
    Ok(())
}
