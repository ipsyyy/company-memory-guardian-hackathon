import { NextResponse } from "next/server";
import { getKnowledgeGaps } from "@/lib/gaps/analyze";
export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Authentication required for production access." }, { status: 403 });
  try { return NextResponse.json(await getKnowledgeGaps(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("Knowledge gaps error", error); return NextResponse.json({ error: "Could not analyze knowledge gaps." }, { status: 500 }); }
}
