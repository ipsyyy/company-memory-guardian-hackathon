import { NextResponse } from 'next/server';
import { getGuardianOverview } from '@/lib/guardian/store';
export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Production access requires authentication.' }, { status: 403 });
  try { return NextResponse.json(await getGuardianOverview(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { console.error(error); return NextResponse.json({ error: 'Could not load guardian.' }, { status: 500 }); }
}
