"use client";

import { useActionState } from "react";
import { updateConversationStatus, type ConversationActionState } from "@/modules/contact-me/conversations/actions";
import {
  conversationStatusLabels,
  conversationStatuses,
  type ConversationStatus,
} from "@/modules/contact-me/conversations/domain";

const initialState: ConversationActionState = {};

export function ConversationStatusForm({
  conversationId,
  currentStatus,
}: {
  conversationId: string;
  currentStatus: ConversationStatus;
}) {
  const [state, action, pending] = useActionState(updateConversationStatus, initialState);

  return (
    <form action={action} className="conversationStatusForm">
      <input type="hidden" name="conversation_id" value={conversationId} />
      <label htmlFor="conversation_status">Status</label>
      <div className="conversationStatusControls">
        <select id="conversation_status" name="status" defaultValue={currentStatus}>
          {conversationStatuses.map((status) => (
            <option key={status} value={status}>{conversationStatusLabels[status]}</option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving..." : "Update"}
        </button>
      </div>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
    </form>
  );
}
