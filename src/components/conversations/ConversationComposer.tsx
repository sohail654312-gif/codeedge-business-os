"use client";

import { useActionState } from "react";
import { addConversationMessage, type ConversationActionState } from "@/modules/contact-me/conversations/actions";

const initialState: ConversationActionState = {};

export function ConversationComposer({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(addConversationMessage, initialState);

  return (
    <form action={action} className="conversationComposer">
      <input type="hidden" name="conversation_id" value={conversationId} />

      <div className="field">
        <label htmlFor="message_kind">Message type</label>
        <select id="message_kind" name="message_kind" defaultValue="reply">
          <option value="reply">Local reply</option>
          <option value="internal">Internal note</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="conversation_body">Message</label>
        <textarea
          id="conversation_body"
          name="body"
          rows={5}
          maxLength={4000}
          required
          placeholder="Write a plain-text message..."
        />
      </div>

      <p className="muted formHelp">
        Local-only: this stores the message in CodeEdge. No WhatsApp, email, SMS or voice delivery is connected yet.
      </p>

      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}

      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Saving..." : "Store message"}
      </button>
    </form>
  );
}
