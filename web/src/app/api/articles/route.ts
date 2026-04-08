import { NextRequest, NextResponse } from 'next/server';
import { getArticles } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const archived = searchParams.get('archived') === 'true';
  const saved = searchParams.get('saved') === 'true';

  const filter = archived ? 'archived' : saved ? 'saved' : undefined;
  const articles = getArticles(filter);
  return NextResponse.json(articles);
}
