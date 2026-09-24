"use client";

import { useActionState } from "react";
import { updateQuoteRequestStatus, type LeadFormState } from "@/modules/buy-from-me/leads/actions";
import {
  quoteRequestStatusLabels,
  quoteRequestStatuses,
  type QuoteRequestStatus,
} from "@/modules/buy-from-me/leads/domain";

const initialState: LeadFormState = {};

export function QuoteRequestStatusForm({
  leadId,
  quoteRequestId,
  currentStatus,
}: {
  leadId: string;
  quoteRequestId: string;
  currentStatus: QuoteRequestStatus;
}) {
  const [state, action, pending] = useActionState(updateQuoteRequestStatus, initialState);

  return (
    <form action={action} className="quoteStatusForm">
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="quote_request_id" value={quoteRequestId} />
      <select name="status" defaultValue={currentStatus} aria-label="Quote Request status">
        {quoteRequestStatuses.map((status) => (
          <option key={status} value={status}>{quoteRequestStatusLabels[status]}</option>
        ))}
      </select>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Updating..." : "Update"}
      </button>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
    </form>
  );
}
