import "server-only";

import {
  ExternalEffectBlockedError,
  requireVoiceExternalEffectAllowed,
} from "./execution";
import { withVoiceCapability } from "./capability";
import { getVoiceProvider } from "./registry";
import {
  requireVoiceCapability,
  VoiceProviderError,
  type VoiceCallStatus,
} from "./provider";

type PreparedOutboundVoiceCall = {
  voice_call_id: string;
  conversation_id: string;
  provider: string;
  assistant_id: string;
  phone_number_id: string;
  display_address: string;
  credential_key: string;
  execution_mode: "demo" | "sandbox" | "production";
  provider_environment: "sandbox" | "production";
  recipient: string;
  status: VoiceCallStatus;
  created: boolean;
};

async function prepareOutbound(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  leadId?: string | null;
  customerId?: string | null;
}) {
  return withVoiceCapability(async (db) => {
    const result = await db.query<PreparedOutboundVoiceCall>(
      "select * from public.voice_prepare_outbound($1,$2,$3,$4,$5)",
      [
        input.businessId,
        input.userId,
        input.correlationId,
        input.leadId ?? null,
        input.customerId ?? null,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Voice call could not be prepared.");
    return row;
  });
}

async function failOutbound(voiceCallId: string, code: string) {
  await withVoiceCapability(async (db) => {
    await db.query(
      "select public.voice_fail_outbound($1,$2)",
      [voiceCallId, code],
    );
  }).catch(() => undefined);
}

export async function startOutboundVoiceCall(input: {
  businessId: string;
  userId: string;
  correlationId: string;
  leadId?: string | null;
  customerId?: string | null;
}) {
  const prepared = await prepareOutbound(input);

  // A prior request with the same correlation ID may already have reached the
  // provider. Never redial an existing request automatically.
  if (!prepared.created) {
    return {
      voiceCallId: prepared.voice_call_id,
      conversationId: prepared.conversation_id,
      status: prepared.status,
      created: false,
    };
  }

  try {
    await requireVoiceExternalEffectAllowed(
      prepared.voice_call_id,
      prepared.provider,
    );
  } catch (error) {
    const blocked = error instanceof ExternalEffectBlockedError
      ? error
      : new ExternalEffectBlockedError("external_effect_invalid_context");
    await failOutbound(prepared.voice_call_id, blocked.code);
    throw blocked;
  }

  let provider;
  try {
    provider = getVoiceProvider(prepared.provider, {
      credentialKey: prepared.credential_key,
      assistantId: prepared.assistant_id,
      phoneNumberId: prepared.phone_number_id,
    });
    requireVoiceCapability(provider, "outbound_calling");
  } catch (error) {
    const code = error instanceof VoiceProviderError
      ? error.code
      : "voice_provider_unavailable";
    await failOutbound(prepared.voice_call_id, code);
    throw new Error("Voice provider is unavailable.");
  }

  let accepted;
  try {
    if (!provider.startOutboundCall) {
      throw new VoiceProviderError("voice_provider_capability_unsupported");
    }
    accepted = await provider.startOutboundCall({
      correlationId: input.correlationId,
      fromNumber: prepared.display_address,
      toNumber: prepared.recipient,
      webhookUrl: "",
    });
  } catch (error) {
    const code = error instanceof VoiceProviderError
      ? error.code
      : "voice_provider_unavailable";
    await failOutbound(prepared.voice_call_id, code);
    throw new Error("Voice call could not be started.");
  }

  try {
    await withVoiceCapability(async (db) => {
      await db.query(
        "select public.voice_accept_outbound($1,$2,$3)",
        [
          prepared.voice_call_id,
          accepted.providerCallId,
          accepted.status,
        ],
      );
    });
  } catch {
    // Provider acceptance is already externally visible. Preserve the
    // canonical request as ambiguous rather than risking a duplicate dial.
    return {
      voiceCallId: prepared.voice_call_id,
      conversationId: prepared.conversation_id,
      status: prepared.status,
      created: true,
    };
  }

  return {
    voiceCallId: prepared.voice_call_id,
    conversationId: prepared.conversation_id,
    status: accepted.status,
    created: true,
  };
}
