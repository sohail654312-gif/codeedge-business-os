import { NextResponse } from "next/server";
import { metaWebhookConfigured } from "@/server/channels/meta-whatsapp";
export const dynamic = "force-dynamic";
export function GET() {
  const configured = metaWebhookConfigured() && !!process.env.WHATSAPP_META_GRAPH_API_VERSION && !!process.env.WHATSAPP_META_CREDENTIALS_JSON && !!process.env.COMMUNICATION_DATABASE_URL;
  return NextResponse.json({ status: configured ? "configured" : "not_configured",liveConnectionVerified: false }, { status: configured ? 200 : 503,headers: { "Cache-Control": "no-store" } });
}
