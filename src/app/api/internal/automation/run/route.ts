import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAutomationRuntimeHealth } from "@/server/automation/health";
import { runPendingAutomations } from "@/server/automation/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function runnerAuthorized(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  if (!process.env.AUTOMATION_RUNNER_SECRET) {
    return NextResponse.json(
      { error: "Automation runner is not configured." },
      { status: 503 },
    );
  }

  if (!runnerAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("probe") === "1") {
    try {
      const health = await getAutomationRuntimeHealth();
      return NextResponse.json(
        {
          status: health.healthy ? "ok" : "degraded",
          probe: true,
          ...health,
        },
        { status: health.healthy ? 200 : 503 },
      );
    } catch {
      return NextResponse.json(
        { status: "unavailable", probe: true },
        { status: 503 },
      );
    }
  }

  const requested = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  const limit = Number.isInteger(requested)
    ? Math.max(1, Math.min(requested, 50))
    : 10;

  try {
    const results = await runPendingAutomations(limit);
    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch {
    return NextResponse.json(
      { error: "Automation runner failed." },
      { status: 500 },
    );
  }
}
