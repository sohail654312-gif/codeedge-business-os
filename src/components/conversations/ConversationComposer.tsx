"use client";

import { useActionState, useState } from "react";
import { addConversationMessage, type ConversationActionState } from "@/modules/contact-me/conversations/actions";

const initialState: ConversationActionState = {};

export function ConversationComposer({
  conversationId,
  channel,
}: {
  conversationId: string;
  channel: "website_chat" | "whatsapp" | "email" | "sms" | "voice" | "internal";
}) {
  const [state, action, pending] = useActionState(addConversationMessage, initialState);
  const [requestId] = useState(() => crypto.randomUUID());

  return (
    <form action={action} className="conversationComposer">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <input type="hidden" name="request_id" value={requestId} />

      <div className="field">
        <label htmlFor="message_kind">Message type</label>
        <select id="message_kind" name="message_kind" defaultValue="reply">
          <option value="reply">{channel === "internal" ? "Local reply" : "Reply"}</option>
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
        {channel === "website_chat"
          ? "Website Chat delivery is live: the visitor receives public outbound replies through the secure widget. Internal notes remain private."
          : channel === "whatsapp"
            ? "WhatsApp delivery is live through the configured provider adapter. Internal notes remain private in Codeedge."
            : channel === "email"
              ? "Email delivery is live through the configured provider adapter. Internal notes remain private in Codeedge."
              : "Local-only: this stores the message in Codeedge. No external delivery adapter is connected for this channel yet."}
      </p>

      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}

      <button className="btn primary" type="submit" disabled={pending}>
        {pending
          ? (channel === "whatsapp" || channel === "email" ? "Sending..." : "Saving...")
          : channel === "website_chat"
            ? "Reply to visitor"
            : channel === "whatsapp"
              ? "Reply on WhatsApp"
              : channel === "email"
                ? "Reply by Email"
                : "Store message"
      </button>
    </form>
  );
}
