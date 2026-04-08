import { NextRequest, NextResponse } from 'next/server';
import { getAnnotations, createAnnotation, updateAnnotation, deleteAnnotation } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get('articleId');
  if (!articleId) {
    return NextResponse.json({ error: 'articleId required' }, { status: 400 });
  }
  return NextResponse.json(getAnnotations(articleId));
}

export async function POST(request: NextRequest) {
  const data = await request.json() as {
    article_id: string;
    highlighted_text: string;
    note_text: string;
    start_offset: number;
    end_offset: number;
    anchor_prefix: string;
    anchor_suffix: string;
  };
  const annotation = createAnnotation(data);
  return NextResponse.json(annotation, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const { id, note_text } = await request.json() as { id: number; note_text: string };
  updateAnnotation(id, note_text);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  deleteAnnotation(Number(id));
  return NextResponse.json({ ok: true });
}
