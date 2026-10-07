import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardTenant } from "@/server/auth/session";
import { withCommunicationCapability } from "@/server/channels/capability";
import { getTextCommunicationProvider } from "@/server/channels/registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  if (!z.string().uuid().safeParse(messageId).success) return new NextResponse("Not found", { status: 404 });
  try {
    const { context } = await requireDashboardTenant();
    const result = await withCommunicationCapability(db => db.query<{ config: unknown }>("select public.whatsapp_media_context($1,$2,$3) as config",[context.business.id,context.userId,messageId]));
    const config = z.object({ businessId: z.string().uuid(),externalSenderId: z.string(),credentialKey: z.string(),providerEnvironment: z.enum(["sandbox","production"]),mediaId: z.string(),mimeType: z.string() }).safeParse(result.rows[0]?.config);
    if (!config.success) return new NextResponse("Not found", { status: 404 });
    const media = await getTextCommunicationProvider("meta_whatsapp_cloud").downloadMedia({ ...config.data,maxBytes: 16 * 1024 * 1024 });
    if (media.mimeType !== config.data.mimeType) return new NextResponse("Unavailable", { status: 503 });
    return new NextResponse(Buffer.from(media.bytes), { headers: { "Content-Type": media.mimeType,"Content-Disposition": 'attachment; filename="whatsapp-attachment"',"Cache-Control": "private, no-store","X-Content-Type-Options": "nosniff","Content-Security-Policy": "sandbox" } });
  } catch { return new NextResponse("Unavailable", { status: 503 }); }
}
