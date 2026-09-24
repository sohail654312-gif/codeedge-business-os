"use client";

import { useActionState } from "react";
import { startLeadConversation, type ConversationActionState } from "@/modules/contact-me/conversations/actions";

const initialState: ConversationActionState = {};

export function StartConversationForm({
  leadId,
  leadName,
}: {
  leadId: string;
  leadName: string;
}) {
  const [state, action, pending] = useActionState(startLeadConversation, initialState);

  return (
    <form action={action} className="startConversationForm">
      <input type="hidden" name="lead_id" value={leadId} />
      <div className="field">
        <label htmlFor="conversation_subject">New internal conversation</label>
        <input
          id="conversation_subject"
          name="subject"
          maxLength={200}
          placeholder={`Conversation with ${leadName}`}
        />
      </div>
      <p className="muted formHelp">Creates a local Shared Inbox thread linked to this Lead.</p>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Starting..." : "Start conversation"}
      </button>
    </form>
  );
}
