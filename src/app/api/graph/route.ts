import { NextResponse } from "next/server";
import { getKnowledgeGraph } from "@/lib/graph/data";
export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Graph access requires authentication before production deployment." }, { status: 403 });
  try { return NextResponse.json(await getKnowledgeGraph(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("Graph query failed", error); return NextResponse.json({ error: "Unable to load graph" }, { status: 500 }); }
}
