import "server-only";

import { timingSafeEqual } from "node:crypto";
import { withVoiceCapability } from "./capability";
import type { NormalizedVoiceWebhookEvent } from "./provider";
import { resolveTenantBoundSecret } from "@/server/credentials/tenant-bound";

export type VoiceConnection = {
  business_id: string;
  connection_id: string;
  provider: string;
  external_account_id: string;
  external_sender_id: string;
  credential_key: string;
  credential_environment: "sandbox" | "production";
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyVoiceWebhookBearer(
  headers: Headers,
  connection: VoiceConnection,
) {
  let configured: string;
  try {
    configured = resolveTenantBoundSecret({
      raw: process.env.VOICE_WEBHOOK_SECRETS_JSON,
      credentialKey: connection.credential_key,
      label: "Voice webhook",
      minimumSecretLength: 16,
      expected: {
        businessId: connection.business_id,
        provider: connection.provider,
        environment: connection.credential_environment,
        expectedMetadata: {
          externalAccountId: connection.external_account_id,
          externalSenderId: connection.external_sender_id,
        },
      },
    });
  } catch {
    return false;
  }

  const authorization = headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;

  return safeEqual(authorization.slice(prefix.length), configured);
}

export async function resolveVoiceConnection(
  provider: string,
  providerConnectionRef: string,
): Promise<VoiceConnection | null> {
  try {
    return await withVoiceCapability(async (db) => {
      const result = await db.query<VoiceConnection>(
        "select * from public.voice_resolve_connection($1,$2)",
        [provider, providerConnectionRef],
      );
      return result.rows[0] ?? null;
    });
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: unknown }).code === "42501"
    ) {
      return null;
    }
    throw error;
  }
}

export async function ingestVoiceProviderEvent(
  connection: VoiceConnection,
  event: NormalizedVoiceWebhookEvent,
) {
  const result = await withVoiceCapability(async (db) => {
    const received = await db.query<{
      voice_call_id: string;
      conversation_id: string;
      business_id: string;
      lead_id: string | null;
      customer_id: string | null;
      inserted: boolean;
    }>(
      "select * from public.voice_receive_event($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        connection.connection_id,
        event.providerEventId,
        event.providerCallId,
        event.direction,
        event.fromNumber,
        event.toNumber,
        event.status,
        event.occurredAt,
      ],
    );

    const call = received.rows[0];
    if (!call) throw new Error("Voice event could not be ingested.");

    if (call.inserted) {
      for (const [index, utterance] of (event.transcript ?? []).entries()) {
        await db.query(
          "select public.voice_append_transcript($1,$2,$3,$4)",
          [
            call.voice_call_id,
            `${event.providerEventId}:${index}`,
            utterance.speaker,
            utterance.text,
          ],
        );
      }
    }

    return call;
  });

  return result;
}
