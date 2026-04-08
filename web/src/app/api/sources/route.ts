import { NextResponse } from 'next/server';
import { getSources } from '@/lib/db';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(getSources());
}
