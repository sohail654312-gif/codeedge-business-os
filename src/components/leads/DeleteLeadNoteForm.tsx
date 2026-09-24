"use client";

import { useActionState } from "react";
import { deleteLeadNote, type LeadFormState } from "@/modules/buy-from-me/leads/actions";

const initialState: LeadFormState = {};

export function DeleteLeadNoteForm({
  leadId,
  noteId,
}: {
  leadId: string;
  noteId: string;
}) {
  const [state, action, pending] = useActionState(deleteLeadNote, initialState);

  return (
    <form
      action={action}
      className="noteDeleteForm"
      onSubmit={(event) => {
        if (!window.confirm("Delete this internal note?")) event.preventDefault();
      }}
    >
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="note_id" value={noteId} />
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      <button className="noteDeleteButton" type="submit" disabled={pending}>
        {pending ? "Deleting..." : "Delete"}
      </button>
    </form>
  );
}
