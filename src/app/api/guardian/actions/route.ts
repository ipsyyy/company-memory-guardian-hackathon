import { NextRequest, NextResponse } from 'next/server';
import { createSimulation } from '@/lib/guardian/store';
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Production access requires authentication.' }, { status: 403 });
  try {
    const body = await request.json();
    if (typeof body.recordId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.recordId)) return NextResponse.json({ error: 'Valid recordId required.' }, { status: 400 });
    return NextResponse.json(await createSimulation(body.recordId), { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: 'Could not create simulation.' }, { status: 500 }); }
}
