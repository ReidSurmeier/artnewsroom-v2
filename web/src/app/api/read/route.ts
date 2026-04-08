import { NextRequest, NextResponse } from 'next/server';
import { markRead } from '@/lib/db';

export async function POST(request: NextRequest) {
  const { articleId } = await request.json() as { articleId: string };
  markRead(articleId);
  return NextResponse.json({ ok: true });
}
