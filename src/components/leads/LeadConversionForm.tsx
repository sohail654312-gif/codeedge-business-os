"use client";

import { useActionState } from "react";
import { convertLeadToCustomer, type LeadFormState } from "@/modules/buy-from-me/leads/actions";

const initialState: LeadFormState & { success?: string } = {};

export function LeadConversionForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(convertLeadToCustomer, initialState);

  return (
    <form action={action} className="conversionForm">
      <input type="hidden" name="lead_id" value={leadId} />
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
      {state.success ? <div className="formSuccess" role="status">{state.success}</div> : null}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Converting..." : "Convert to customer"}
      </button>
    </form>
  );
}
