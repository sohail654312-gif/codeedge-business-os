import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runPendingAutomations } from "@/server/automation/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cronAuthorized(request: NextRequest) {
  const configured = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!configured || configured.length < 32 || !header?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = header.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Automation cron is not configured." }, { status: 503 });
  }
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const results = await runPendingAutomations(10);
    return NextResponse.json({
      status: "ok",
      scheduled: true,
      processed: results.length,
      results,
    });
  } catch {
    return NextResponse.json(
      { status: "failed", scheduled: true, error: "Automation cron failed." },
      { status: 500 },
    );
  }
}
