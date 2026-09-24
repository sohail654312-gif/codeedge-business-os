"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createLead, type LeadFormState } from "@/modules/buy-from-me/leads/actions";
import { leadSourceLabels, leadSources } from "@/modules/buy-from-me/leads/domain";

const initialState: LeadFormState = {};

export function LeadCreateForm({
  services,
}: {
  services: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createLead, initialState);

  return (
    <form action={action} className="leadCreateForm">
      <div className="formGrid">
        <div className="field">
          <label htmlFor="contact_name">Contact name</label>
          <input id="contact_name" name="contact_name" maxLength={120} required />
        </div>

        <div className="field">
          <label htmlFor="source">Lead source</label>
          <select id="source" name="source" defaultValue="manual" required>
            {leadSources.map((source) => (
              <option key={source} value={source}>{leadSourceLabels[source]}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" maxLength={40} autoComplete="tel" />
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" maxLength={254} autoComplete="email" />
        </div>

        <div className="field">
          <label htmlFor="service_id">Service</label>
          <select id="service_id" name="service_id" defaultValue="">
            <option value="">No service selected</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>{service.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="estimated_value_gbp">Estimated value (£)</label>
          <input
            id="estimated_value_gbp"
            name="estimated_value_gbp"
            type="number"
            min="0"
            max="10000000"
            step="0.01"
            inputMode="decimal"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="enquiry_summary">Enquiry summary</label>
        <textarea id="enquiry_summary" name="enquiry_summary" maxLength={3000} rows={6} required />
      </div>

      <p className="muted formHelp">Add at least a phone number or email address.</p>
      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}

      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Saving Lead..." : "Save Lead"}
        </button>
        <Link className="btn" href="/dashboard/buy-from-me/leads">Cancel</Link>
      </div>
    </form>
  );
}
