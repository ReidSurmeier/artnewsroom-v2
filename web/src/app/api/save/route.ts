import { NextRequest, NextResponse } from 'next/server';
import { toggleSave } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { articleId, saved } = await request.json() as { articleId: string; saved: boolean };
  toggleSave(articleId, saved);
  return NextResponse.json({ ok: true });
}
