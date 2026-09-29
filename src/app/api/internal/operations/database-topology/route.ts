import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { restrictedDatabaseTopologySummary } from "@/server/db/topology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const configured = process.env.AUTOMATION_RUNNER_SECRET;
  const header = request.headers.get("authorization");

  if (!configured || configured.length < 32 || !header?.startsWith("Bearer ")) {
    return false;
  }

  const supplied = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(configured);

  return supplied.length === expected.length
    && timingSafeEqual(supplied, expected);
}

export async function GET(request: NextRequest) {
  if (!process.env.AUTOMATION_RUNNER_SECRET) {
    return NextResponse.json({ status: "not_configured" }, { status: 503 });
  }

  if (!authorized(request)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "ok",
    topology: restrictedDatabaseTopologySummary(),
  });
}
