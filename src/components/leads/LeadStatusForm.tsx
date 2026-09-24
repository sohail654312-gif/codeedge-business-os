"use client";

import { useActionState } from "react";
import { updateLeadStatus, type LeadFormState } from "@/modules/buy-from-me/leads/actions";
import {
  leadStatusLabels,
  leadStatuses,
  type LeadStatus,
} from "@/modules/buy-from-me/leads/domain";

const initialState: LeadFormState = {};

export function LeadStatusForm({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: LeadStatus;
}) {
  const [state, action, pending] = useActionState(updateLeadStatus, initialState);

  return (
    <form action={action} className="leadStatusForm">
      <input type="hidden" name="lead_id" value={leadId} />
      <label htmlFor="lead_status">Sales stage</label>
      <div className="leadStatusControls">
        <select id="lead_status" name="status" defaultValue={currentStatus}>
          {leadStatuses.map((status) => (
            <option key={status} value={status}>
              {leadStatusLabels[status]}
            </option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Updating..." : "Update status"}
        </button>
      </div>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}
    </form>
  );
}
