import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runPendingAutomations } from "@/server/automation/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerAuthorized(request: NextRequest, configured: string | undefined) {
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

function requestedLimit(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  return Number.isInteger(requested)
    ? Math.max(1, Math.min(requested, 50))
    : 10;
}

async function run(request: NextRequest) {
  try {
    const results = await runPendingAutomations(requestedLimit(request));
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

// Vercel Cron invokes configured paths with GET and attaches CRON_SECRET as
// Authorization: Bearer <secret>. This keeps the recurring trigger represented
// in deployment configuration without exposing the restricted worker.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Automation cron is not configured." },
      { status: 503 },
    );
  }

  if (!bearerAuthorized(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return run(request);
}

// POST remains available to an explicitly configured internal scheduler or
// operator and intentionally uses a separate secret from Vercel Cron.
export async function POST(request: NextRequest) {
  if (!process.env.AUTOMATION_RUNNER_SECRET) {
    return NextResponse.json(
      { error: "Automation runner is not configured." },
      { status: 503 },
    );
  }

  if (!bearerAuthorized(request, process.env.AUTOMATION_RUNNER_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return run(request);
}
