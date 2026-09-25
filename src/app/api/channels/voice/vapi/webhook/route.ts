import { NextResponse } from "next/server";
import { parseVapiServerMessage } from "@/server/voice/vapi";
import {
  ingestVoiceProviderEvent,
  resolveVoiceConnection,
  verifyVoiceWebhookBearer,
} from "@/server/voice/inbound";

const MAX_WEBHOOK_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_WEBHOOK_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (Buffer.byteLength(text, "utf8") > MAX_WEBHOOK_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  let event;
  try {
    event = parseVapiServerMessage(payload);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!event.providerConnectionRef) {
    return new NextResponse(null, { status: 400 });
  }

  const connection = await resolveVoiceConnection(
    "vapi",
    event.providerConnectionRef,
  );
  if (!connection) {
    return new NextResponse(null, { status: 401 });
  }

  if (!verifyVoiceWebhookBearer(request.headers, connection.credential_key)) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    await ingestVoiceProviderEvent(connection, event);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  return new NextResponse(null, { status: 204 });
}
