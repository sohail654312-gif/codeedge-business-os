"use client";
import { useActionState, useState } from "react";
import { changeWhatsAppControl, replyWithWhatsAppTemplate, saveWhatsAppConsent, type WhatsAppSettingsState } from "@/modules/whatsapp/actions";
import type { Conversation } from "@/types/database";
const initial: WhatsAppSettingsState = {};
function Notice({ state }: { state: WhatsAppSettingsState }) { return <>{state.error ? <p role="alert">{state.error}</p> : null}{state.success ? <p role="status">{state.success}</p> : null}</>; }
export function WhatsAppConversationControls({ conversation, isOwner }: { conversation: Conversation; isOwner: boolean }) {
  const [control, controlAction, changing] = useActionState(changeWhatsAppControl, initial);
  const [consent, consentAction, saving] = useActionState(saveWhatsAppConsent, initial);
  const [template, templateAction, sending] = useActionState(replyWithWhatsAppTemplate, initial);
  const [requestId] = useState(() => crypto.randomUUID());
  const human = conversation.automation_state === "human";
  return <section className="panel topGap">
    <h2>WhatsApp conversation control</h2>
    <p>{human ? "Human control — AI replies paused" : "Automation permitted when enabled for this workspace"}</p>
    {conversation.handoff_reason ? <p className="muted">Handoff: {conversation.handoff_reason.replaceAll("_", " ")}</p> : null}
    <p className="muted">{conversation.whatsapp_opted_out_at ? "Customer opted out. Outbound messages are suppressed." : conversation.last_customer_message_at && Date.now() - new Date(conversation.last_customer_message_at).getTime() < 86400000 ? "Customer service window open. Free-form replies permitted." : "Service window closed. An approved template with recorded consent is required."}</p>
    <form action={controlAction}><input type="hidden" name="conversation_id" value={conversation.id} /><input type="hidden" name="state" value={human ? "automatic" : "human"} />
      <button className="btn" disabled={changing || (!!conversation.whatsapp_opted_out_at && human)}>{human ? "Resume automation for future messages" : "Take human control"}</button><Notice state={control} />
    </form>
    {isOwner ? <details className="topGap"><summary>Record outbound consent</summary><form action={consentAction} className="businessInfoForm">
      <input type="hidden" name="conversation_id" value={conversation.id} /><label className="checkField"><input type="checkbox" name="consent" defaultChecked={!!conversation.whatsapp_consent_at} /> Customer explicitly agreed to WhatsApp messages</label>
      <label htmlFor="wa-consent-source">Consent evidence/source</label><input id="wa-consent-source" name="source" required maxLength={240} placeholder="Where and when the customer agreed" />
      <button className="btn" disabled={saving}>Record consent</button><Notice state={consent} />
    </form></details> : null}
    <details className="topGap"><summary>Send approved template</summary><form action={templateAction} className="businessInfoForm">
      <input type="hidden" name="conversation_id" value={conversation.id} /><input type="hidden" name="request_id" value={requestId} />
      <label htmlFor="wa-template">Approved template name</label><input id="wa-template" name="name" required pattern="[a-z0-9_]+" />
      <label htmlFor="wa-language">Template language</label><input id="wa-language" name="language" required defaultValue="en_US" />
      <label htmlFor="wa-parameters">Body text parameters (one per line)</label><textarea id="wa-parameters" name="parameters" rows={3} />
      <p className="muted">The owner must refresh approvals in Settings first. Recorded consent and opt-out rules apply.</p>
      <button className="btn" disabled={sending || !!conversation.whatsapp_opted_out_at}>Send template</button><Notice state={template} />
    </form></details>
  </section>;
}
