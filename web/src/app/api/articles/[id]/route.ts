import { NextRequest, NextResponse } from 'next/server';
import { getArticle } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return params.then(({ id }) => {
    const article = getArticle(id);
    if (!article) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(article);
  });
}
