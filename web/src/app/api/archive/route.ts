import { NextRequest, NextResponse } from 'next/server';
import { toggleArchive } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { articleId, archived } = await request.json() as { articleId: string; archived: boolean };
  toggleArchive(articleId, archived);
  return NextResponse.json({ ok: true });
}
