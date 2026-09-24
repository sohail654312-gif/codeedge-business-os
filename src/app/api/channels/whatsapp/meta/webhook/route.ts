import { NextRequest, NextResponse } from "next/server";
import {
  parseMetaWebhook,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "@/server/channels/meta-whatsapp";
import {
  receiveWhatsAppText,
  updateWhatsAppDelivery,
} from "@/server/channels/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 512 * 1024;

export async function GET(request: NextRequest) {
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
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  if (!verifyMetaWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    process.env.WHATSAPP_META_APP_SECRET,
  )) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  let events: ReturnType<typeof parseMetaWebhook>;
  try {
    events = parseMetaWebhook(payload);
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  try {
    for (const message of events.messages) {
      await receiveWhatsAppText(message);
    }

    for (const status of events.statuses) {
      await updateWhatsAppDelivery({
        providerMessageId: status.providerMessageId,
        status: status.status,
        errorCode: status.errorCode,
      });
    }
  } catch {
    // A non-2xx response lets the provider retry. Database/provider details stay private.
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
