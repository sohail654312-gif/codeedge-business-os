"use client";

import { useActionState } from "react";
import { addLeadNote, type LeadFormState } from "@/modules/buy-from-me/leads/actions";

const initialState: LeadFormState = {};

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(addLeadNote, initialState);

  return (
    <form action={action} className="leadNoteForm">
      <input type="hidden" name="lead_id" value={leadId} />
      <div className="field">
        <label htmlFor="lead_note_body">New internal note</label>
        <textarea
          id="lead_note_body"
          name="body"
          rows={4}
          maxLength={5000}
          placeholder="Add context for your team..."
          required
        />
      </div>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Adding note..." : "Add note"}
      </button>
    </form>
  );
}
