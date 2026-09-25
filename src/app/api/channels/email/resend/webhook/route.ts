import { NextRequest, NextResponse } from "next/server";
import {
  parseResendWebhook,
  verifyResendWebhookSignature,
} from "@/server/channels/resend-email";
import {
  receiveResendInbound,
  updateEmailDelivery,
} from "@/server/channels/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  if (!verifyResendWebhookSignature(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    process.env.EMAIL_RESEND_WEBHOOK_SECRET,
  )) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  let event: ReturnType<typeof parseResendWebhook>;
  try {
    event = parseResendWebhook(payload);
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  try {
    if (event.kind === "received") {
      for (const recipient of event.recipients) {
        await receiveResendInbound(event.providerMessageId, recipient);
      }
    } else if (event.kind === "delivery") {
      await updateEmailDelivery({
        providerMessageId: event.providerMessageId,
        status: event.status,
        errorCode: event.errorCode,
      });
    }
  } catch {
    // A retry is safe because inbound processing and outbound dispatch are idempotent.
    // Keep tenant/provider details out of the public response.
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
