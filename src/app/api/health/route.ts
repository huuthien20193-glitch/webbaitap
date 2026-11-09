import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Health check cho Render / uptime monitor */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "studyflow",
    time: new Date().toISOString(),
  });
}
