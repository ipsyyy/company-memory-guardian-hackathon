import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { error } = await supabase
      .from("connection_test")
      .select("*")
      .limit(1);

    if (error) {
      return NextResponse.json({
        status: "supabase_reachable",
        message: error.message,
      });
    }

    return NextResponse.json({
      status: "connected",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}