import { NextRequest, NextResponse } from "next/server";
import {
  parseTwilioSmsWebhook,
  twilioSmsWebhookUrl,
  verifyTwilioWebhookSignature,
} from "@/server/channels/twilio-sms";
import {
  receiveSmsText,
  resolveSmsConnection,
  updateSmsDelivery,
} from "@/server/channels/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 64 * 1024;

function twimlResponse() {
  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let params: URLSearchParams;
  let event: ReturnType<typeof parseTwilioSmsWebhook>;
  try {
    params = new URLSearchParams(rawBody);
    event = parseTwilioSmsWebhook(params);
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }

  let connection;
  try {
    connection = await resolveSmsConnection(event.externalSenderId);
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  if (!connection || connection.external_account_id !== event.accountSid) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let signatureUrl: string;
  try {
    signatureUrl = twilioSmsWebhookUrl();
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  if (!verifyTwilioWebhookSignature({
    url: signatureUrl,
    params,
    signature: request.headers.get("x-twilio-signature"),
    credentialKey: connection.credential_key,
  })) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    if (event.kind === "inbound") {
      await receiveSmsText(event);
      return twimlResponse();
    }

    if (event.status) {
      await updateSmsDelivery({
        providerMessageId: event.providerMessageId,
        status: event.status,
        errorCode: event.errorCode,
      });
    }
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
