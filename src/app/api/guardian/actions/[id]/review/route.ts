import { NextRequest, NextResponse } from 'next/server';
import { reviewSimulation } from '@/lib/guardian/store';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Production access requires authentication.' }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json();
    if (!/^[0-9a-f-]{36}$/i.test(id) || !['approved', 'rejected'].includes(body.verdict) || typeof body.reviewer !== 'string' || body.reviewer.trim().length < 2 || body.reviewer.length > 100 || typeof body.explanation !== 'string' || body.explanation.length > 1000) return NextResponse.json({ error: 'Valid verdict, reviewer, and explanation required.' }, { status: 400 });
    const result = await reviewSimulation(id, body.verdict, body.reviewer.trim(), body.explanation);
    return NextResponse.json(result, { status: result.conflict ? 409 : 200 });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Review failed.' }, { status: 500 }); }
}
