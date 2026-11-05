import { NextRequest, NextResponse } from "next/server";
import { askCompanyBrain } from "@/lib/brain/ask";



export async function POST(request: NextRequest) {
  // Public access requires authentication and rate limiting.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Authentication required before public deployment." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    if (typeof body.question !== "string" ||
        !body.question.trim() ||
        body.question.length > 1000) {
      return NextResponse.json(
        { error: "A question of 1–1000 characters is required." },
        { status: 400 }
      );
    }

    const result = await askCompanyBrain(body.question);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Company Brain error:", error);

    return NextResponse.json(
      { error: "Unable to answer question. Check server logs." },
      { status: 500 }
    );
  }
}
