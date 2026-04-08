import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), '..', 'data', 'newsroom.db');

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get('articleId');
  if (!articleId) {
    return NextResponse.json(null);
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='drawings'`
    ).get();
    if (!tableExists) {
      db.close();
      return NextResponse.json(null);
    }
    const row = db.prepare(
      `SELECT * FROM drawings WHERE article_id = ?`
    ).get(articleId) as { article_id: string; drawing_data: string } | null;
    db.close();
    return NextResponse.json(row ?? null);
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(request: NextRequest) {
  const { articleId, drawingData } = await request.json() as { articleId: string; drawingData: string };

  try {
    const db = new Database(DB_PATH, { readonly: false });
    db.pragma('journal_mode = WAL');

    // Ensure table exists
    db.prepare(`
      CREATE TABLE IF NOT EXISTS drawings (
        article_id TEXT PRIMARY KEY,
        drawing_data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();

    db.prepare(`
      INSERT INTO drawings (article_id, drawing_data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(article_id) DO UPDATE SET drawing_data = excluded.drawing_data, updated_at = excluded.updated_at
    `).run(articleId, drawingData, new Date().toISOString());

    db.close();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
