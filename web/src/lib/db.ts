import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), '..', 'data', 'newsroom.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('busy_timeout = 5000');
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

export interface ArticleRow {
  id: string;
  title: string;
  url: string;
  source: string;
  source_url: string | null;
  author: string | null;
  published_at: string | null;
  scraped_at: string;
  excerpt: string | null;
  image_url: string | null;
  score: number;
  score_breakdown: string | null;
  word_count: number;
  is_read: number;
  is_saved: number;
  is_archived: number;
  quality_score: number;
  date_added: string;
}

export interface ArticleWithContent extends ArticleRow {
  content_html: string | null;
  content_markdown: string | null;
}

export interface AnnotationRow {
  id: number;
  article_id: string;
  highlighted_text: string;
  note_text: string;
  start_offset: number;
  end_offset: number;
  created_at: string;
  anchor_prefix: string;
  anchor_suffix: string;
}

export interface SourceRow {
  id: number;
  name: string;
  url: string;
  feed_url: string | null;
  tier: number;
  scrape_method: string;
  is_paywalled: number;
  last_fetched: string | null;
  fetch_count: number;
  error_count: number;
  enabled: number;
}

export function getArticles(filter?: 'archived' | 'saved'): ArticleRow[] {
  const db = getDb();
  if (filter === 'archived') {
    return db.prepare(
      `SELECT id, title, url, source, source_url, author, published_at, scraped_at,
       excerpt, image_url, score, score_breakdown, word_count, is_read, is_saved,
       is_archived, quality_score, date_added
       FROM articles WHERE is_archived = 1 ORDER BY date_added DESC`
    ).all() as ArticleRow[];
  }
  if (filter === 'saved') {
    return db.prepare(
      `SELECT id, title, url, source, source_url, author, published_at, scraped_at,
       excerpt, image_url, score, score_breakdown, word_count, is_read, is_saved,
       is_archived, quality_score, date_added
       FROM articles WHERE is_saved = 1 ORDER BY date_added DESC`
    ).all() as ArticleRow[];
  }
  return db.prepare(
    `SELECT id, title, url, source, source_url, author, published_at, scraped_at,
     excerpt, image_url, score, score_breakdown, word_count, is_read, is_saved,
     is_archived, quality_score, date_added
     FROM articles WHERE is_archived = 0 ORDER BY date_added DESC`
  ).all() as ArticleRow[];
}

export function getArticle(id: string): ArticleWithContent | null {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM articles WHERE id = ?`
  ).get(id) as ArticleWithContent | null;
}

export function markRead(articleId: string): void {
  const db = getDb();
  db.prepare(`UPDATE articles SET is_read = 1 WHERE id = ?`).run(articleId);
}

export function toggleArchive(articleId: string, archived: boolean): void {
  const db = getDb();
  db.prepare(`UPDATE articles SET is_archived = ? WHERE id = ?`).run(archived ? 1 : 0, articleId);
}

export function toggleSave(articleId: string, saved: boolean): void {
  const db = getDb();
  db.prepare(`UPDATE articles SET is_saved = ? WHERE id = ?`).run(saved ? 1 : 0, articleId);
}

export function getAnnotations(articleId: string): AnnotationRow[] {
  const db = getDb();
  return db.prepare(
    `SELECT * FROM annotations WHERE article_id = ? ORDER BY start_offset ASC`
  ).all(articleId) as AnnotationRow[];
}

export function createAnnotation(data: {
  article_id: string;
  highlighted_text: string;
  note_text: string;
  start_offset: number;
  end_offset: number;
  anchor_prefix: string;
  anchor_suffix: string;
}): AnnotationRow {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO annotations (article_id, highlighted_text, note_text, start_offset, end_offset, created_at, anchor_prefix, anchor_suffix)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.article_id,
    data.highlighted_text,
    data.note_text,
    data.start_offset,
    data.end_offset,
    new Date().toISOString(),
    data.anchor_prefix,
    data.anchor_suffix
  );
  return db.prepare(`SELECT * FROM annotations WHERE id = ?`).get(result.lastInsertRowid) as AnnotationRow;
}

export function updateAnnotation(id: number, noteText: string): void {
  const db = getDb();
  db.prepare(`UPDATE annotations SET note_text = ? WHERE id = ?`).run(noteText, id);
}

export function deleteAnnotation(id: number): void {
  const db = getDb();
  db.prepare(`DELETE FROM annotations WHERE id = ?`).run(id);
}

export function getAnnotationCounts(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(
    `SELECT article_id, COUNT(*) as count FROM annotations GROUP BY article_id`
  ).all() as Array<{ article_id: string; count: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.article_id] = row.count;
  }
  return result;
}

export function getSources(): SourceRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM sources ORDER BY tier ASC, name ASC`).all() as SourceRow[];
}

export interface StatusData {
  total_articles: number;
  unread_count: number;
  saved_count: number;
  archived_count: number;
  last_scan: {
    started_at: string;
    finished_at: string | null;
    sources_scanned: number;
    candidates_found: number;
    articles_promoted: number;
    errors: string | null;
  } | null;
}

export function getStatus(): StatusData {
  const db = getDb();
  const counts = db.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN is_read = 0 AND is_archived = 0 THEN 1 ELSE 0 END) as unread,
       SUM(CASE WHEN is_saved = 1 THEN 1 ELSE 0 END) as saved,
       SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END) as archived
     FROM articles`
  ).get() as { total: number; unread: number; saved: number; archived: number };

  const lastScan = db.prepare(
    `SELECT * FROM scan_logs ORDER BY started_at DESC LIMIT 1`
  ).get() as {
    started_at: string;
    finished_at: string | null;
    sources_scanned: number;
    candidates_found: number;
    articles_promoted: number;
    errors: string | null;
  } | null;

  return {
    total_articles: counts.total,
    unread_count: counts.unread,
    saved_count: counts.saved,
    archived_count: counts.archived,
    last_scan: lastScan ?? null,
  };
}
