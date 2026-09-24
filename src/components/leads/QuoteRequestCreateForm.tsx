"use client";

import { useActionState } from "react";
import { createQuoteRequest, type LeadFormState } from "@/modules/buy-from-me/leads/actions";

const initialState: LeadFormState = {};

export function QuoteRequestCreateForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(createQuoteRequest, initialState);

  return (
    <form action={action} className="quoteRequestForm">
      <input type="hidden" name="lead_id" value={leadId} />
      <div className="field">
        <label htmlFor="quote_request_details">New Quote Request</label>
        <textarea
          id="quote_request_details"
          name="details"
          rows={4}
          maxLength={5000}
          placeholder="Describe what needs to be quoted..."
          required
        />
      </div>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create Quote Request"}
      </button>
    </form>
  );
}
