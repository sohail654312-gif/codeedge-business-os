import { after, NextRequest, NextResponse } from "next/server";
import { runPendingAutomations } from "@/server/automation/runner";
import {
  parseMetaWebhook,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@/server/channels/meta-whatsapp";
import {
  receiveWhatsAppText,
  updateWhatsAppDelivery,
  whatsappLog,
} from "@/server/channels/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 512 * 1024;

export async function GET(request: NextRequest) {
  if (!process.env.WHATSAPP_META_VERIFY_TOKEN) return new NextResponse("Unavailable", { status: 503 });
  const params = request.nextUrl.searchParams;
  const valid = verifyMetaWebhookChallenge(
    params.get("hub.mode"),
    params.get("hub.verify_token"),
    process.env.WHATSAPP_META_VERIFY_TOKEN,
  );

  if (!valid) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const challenge = params.get("hub.challenge");
  if (!challenge || challenge.length > 500) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.WHATSAPP_META_APP_SECRET) return NextResponse.json({ error: "Webhook unavailable." }, { status: 503 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "Payload too large." }, { status: 413 });
      }
      chunks.push(part.value);
    }
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  } finally { reader.releaseLock(); }
  const rawBody = Buffer.concat(chunks);

  if (!verifyMetaWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    process.env.WHATSAPP_META_APP_SECRET,
  )) {
    whatsappLog("webhook_rejected", { code: "invalid_signature" });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  let events: ReturnType<typeof parseMetaWebhook>;
  try {
    events = parseMetaWebhook(payload);
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  whatsappLog("webhook_received");
  let inserted = false;
  try {
    for (const message of events.messages) {
      const result = await receiveWhatsAppText(message);
      inserted ||= result?.inserted ?? false;
    }

    for (const status of events.statuses) {
      await updateWhatsAppDelivery({
        externalSenderId: status.externalSenderId,
        providerMessageId: status.providerMessageId,
        status: status.status,
        errorCode: status.errorCode,
      });
    }
  } catch {
    // A non-2xx response lets the provider retry. Database/provider details stay private.
    whatsappLog("webhook_processing_failed", { code: "database_unavailable" });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 503 });
  }

  // The DB trigger already queued durable runs. Vercel keeps this work alive
  // after acknowledging Meta; a failed drain is recoverable by the existing runner.
  if (inserted) after(async () => {
    try { await runPendingAutomations(10); }
    catch { whatsappLog("automation_drain_failed", { code: "runner_unavailable" }); }
  });

  return NextResponse.json({ ok: true });
}
