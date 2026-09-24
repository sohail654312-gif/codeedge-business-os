import { NextResponse } from "next/server";
import { renderWebsiteChatEmbedScript } from "@/server/website-chat/embed";

export const runtime = "nodejs";

export async function GET() {
  return new NextResponse(renderWebsiteChatEmbedScript(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
