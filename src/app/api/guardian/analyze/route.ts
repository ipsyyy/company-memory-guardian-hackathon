import { NextRequest, NextResponse } from "next/server";
import { analyzeDecision } from "@/lib/guardian/analyze";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Authentication required before public deployment." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    if (
      typeof body.question !== "string" ||
      !body.question.trim() ||
      body.question.length > 1000
    ) {
      return NextResponse.json(
        { error: "A question of 1–1000 characters is required." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await analyzeDecision(body.question)
    );
  } catch (error) {
    console.error("Decision Guardian analysis error:", error);

    return NextResponse.json(
      { error: "Unable to analyze decision history." },
      { status: 500 }
    );
  }
}
