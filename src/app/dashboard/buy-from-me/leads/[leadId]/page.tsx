import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoLead, formatLeadValue } from "@/modules/buy-from-me/leads/demo";
import { leadSourceLabels, leadStatusLabels } from "@/modules/buy-from-me/leads/domain";

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const lead = getDemoLead(leadId);

  if (!lead) notFound();

  return (
    <>
      <div className="pageHead">
        <div>
          <Link className="backLink" href="/dashboard/buy-from-me/leads">← All leads</Link>
          <div className="eyebrow topGap">Lead details</div>
          <h1>{lead.contactName}</h1>
          <p className="muted">Review the enquiry before editing and workflow actions are enabled.</p>
        </div>
        <div className="row">
          <span className={"leadStatus leadStatus" + leadStatusLabels[lead.status].replace(/\s+/g, "")}>
            {leadStatusLabels[lead.status]}
          </span>
          <button className="btn primary" type="button" disabled title="Editing arrives in the next step">
            Edit lead
          </button>
        </div>
      </div>

      <div className="leadDetailGrid">
        <section className="panel">
          <h2>Contact</h2>
          <dl className="detailList">
            <div><dt>Name</dt><dd>{lead.contactName}</dd></div>
            <div><dt>Phone</dt><dd>{lead.phone}</dd></div>
            <div><dt>Email</dt><dd>{lead.email}</dd></div>
            <div><dt>Source</dt><dd>{leadSourceLabels[lead.source]}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h2>Opportunity</h2>
          <dl className="detailList">
            <div><dt>Service</dt><dd>{lead.serviceName}</dd></div>
            <div><dt>Status</dt><dd>{leadStatusLabels[lead.status]}</dd></div>
            <div><dt>Estimated value</dt><dd>{formatLeadValue(lead.estimatedValuePence)}</dd></div>
            <div><dt>Last contact</dt><dd>{lead.lastContactLabel}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel topGap">
        <h2>Enquiry summary</h2>
        <p className="leadSummaryText">{lead.enquirySummary}</p>
      </section>

      <div className="twoCol topGap">
        <section className="panel">
          <h2>Internal notes</h2>
          <p className="muted">Notes are not enabled yet. They will be added as a separate secured CRM step.</p>
        </section>
        <section className="panel">
          <h2>Quote requests</h2>
          <p className="muted">Quote requests are not enabled yet. They remain separate from the lead lifecycle.</p>
        </section>
      </div>
    </>
  );
}
