import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAutomationRuntimeHealth } from "@/server/automation/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const configured = process.env.AUTOMATION_RUNNER_SECRET;
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
  if (!process.env.AUTOMATION_RUNNER_SECRET) {
    return NextResponse.json({ status: "not_configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  try {
    const health = await getAutomationRuntimeHealth();
    return NextResponse.json(
      { status: health.healthy ? "ok" : "degraded", ...health },
      { status: health.healthy ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
