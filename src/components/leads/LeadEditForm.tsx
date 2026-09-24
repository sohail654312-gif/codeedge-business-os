"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updateLead, type LeadFormState } from "@/modules/buy-from-me/leads/actions";
import { leadSourceLabels, leadSources } from "@/modules/buy-from-me/leads/domain";

const initialState: LeadFormState = {};

export function LeadEditForm({
  lead,
  services,
}: {
  lead: {
    id: string;
    contact_name: string;
    phone: string;
    email: string;
    source: (typeof leadSources)[number];
    service_id: string | null;
    enquiry_summary: string;
    estimated_value_pence: number | null;
  };
  services: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(updateLead, initialState);
  const estimatedValueGbp = lead.estimated_value_pence === null
    ? ""
    : (lead.estimated_value_pence / 100).toFixed(2);

  return (
    <form action={action} className="leadCreateForm">
      <input type="hidden" name="lead_id" value={lead.id} />

      <div className="formGrid">
        <div className="field">
          <label htmlFor="contact_name">Contact name</label>
          <input id="contact_name" name="contact_name" maxLength={120} defaultValue={lead.contact_name} required />
        </div>

        <div className="field">
          <label htmlFor="source">Lead source</label>
          <select id="source" name="source" defaultValue={lead.source} required>
            {leadSources.map((source) => (
              <option key={source} value={source}>{leadSourceLabels[source]}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" maxLength={40} autoComplete="tel" defaultValue={lead.phone} />
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" maxLength={254} autoComplete="email" defaultValue={lead.email} />
        </div>

        <div className="field">
          <label htmlFor="service_id">Service</label>
          <select id="service_id" name="service_id" defaultValue={lead.service_id ?? ""}>
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
            defaultValue={estimatedValueGbp}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="enquiry_summary">Enquiry summary</label>
        <textarea
          id="enquiry_summary"
          name="enquiry_summary"
          maxLength={3000}
          rows={6}
          defaultValue={lead.enquiry_summary}
          required
        />
      </div>

      <p className="muted formHelp">
        Status is managed separately so contact edits cannot silently change the sales stage.
      </p>

      {state.error ? <div className="formError" role="alert">{state.error}</div> : null}

      <div className="row">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Saving changes..." : "Save changes"}
        </button>
        <Link className="btn" href={`/dashboard/buy-from-me/leads/${lead.id}`}>Cancel</Link>
      </div>
    </form>
  );
}
