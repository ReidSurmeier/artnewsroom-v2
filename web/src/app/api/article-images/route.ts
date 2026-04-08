import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), '..', 'data', 'newsroom.db');

interface ArticleImage {
  id: number;
  article_id: string;
  original_url: string;
  ascii_art: string;
  bw_image_path: string;
  alt_text: string;
  position: number;
}

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get('articleId');
  if (!articleId) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });
    // Check if article_images table exists
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='article_images'`
    ).get();
    if (!tableExists) {
      db.close();
      return NextResponse.json([]);
    }
    const rows = db.prepare(
      `SELECT * FROM article_images WHERE article_id = ? ORDER BY position ASC`
    ).all(articleId) as ArticleImage[];
    db.close();
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([]);
  }
}
