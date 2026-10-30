import { NextResponse } from "next/server";
import { metaConfigurationReady } from "@/server/channels/meta-configuration";

export const dynamic = "force-dynamic";

// Configuration only. Never interpret HTTP 200 as live Meta delivery verification.
export function GET() {
  const configured = metaConfigurationReady();
  return NextResponse.json(
    { status: configured ? "configured" : "not_configured", liveConnectionVerified: false },
    { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
