import "server-only";

import { withCommunicationCapability } from "./capability";
import { decideWhatsAppAutoReply } from "./whatsapp-auto-reply-policy";
import type { MetaInboundTextEvent } from "./meta-whatsapp";

/**
 * Called only after signed Meta webhook ingestion into canonical messages.
 * The restricted SQL capability validates the inbound message's tenant and
 * configured sender, and persists a suggestion for staff. NO EXTERNAL SEND.
 */
export async function planWhatsAppAutoReply(
  event: MetaInboundTextEvent,
  inboundMessageId: string,
): Promise<"draft" | "human_requested" | "opt_out" | "muted" | "limit_reached" | "duplicate" | "disabled"> {
  const decision = decideWhatsAppAutoReply(event.body);
  return withCommunicationCapability(async (db) => {
    const result = await db.query<{ outcome: string }>(
      "select public.whatsapp_plan_auto_reply($1,$2,$3,$4) as outcome",
      [event.externalSenderId, inboundMessageId, decision.action, decision.suggestion],
    );
    const outcome = result.rows[0]?.outcome;
    if (!outcome || ![
      "draft", "human_requested", "opt_out", "muted",
      "limit_reached", "duplicate", "disabled",
    ].includes(outcome)) {
      throw new Error("Invalid WhatsApp draft decision.");
    }
    return outcome as Awaited<ReturnType<typeof planWhatsAppAutoReply>>;
  });
}
