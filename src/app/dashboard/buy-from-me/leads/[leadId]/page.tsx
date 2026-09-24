import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadStatusForm } from "@/components/leads/LeadStatusForm";
import { formatLeadDate, formatLeadValue, getLead } from "@/modules/buy-from-me/leads/data";
import { leadSourceLabels, leadStatusLabels } from "@/modules/buy-from-me/leads/domain";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const { client, context } = await requireDashboardTenant();
  const lead = await getLead(client, context.business.id, leadId);

  if (!lead) notFound();

  return (
    <>
      <div className="pageHead">
        <div>
          <Link className="backLink" href="/dashboard/buy-from-me/leads">← All leads</Link>
          <div className="eyebrow topGap">Lead details</div>
          <h1>{lead.contact_name}</h1>
          <p className="muted">This record is loaded from the tenant-protected CRM database.</p>
        </div>
        <div className="row">
          <span className={"leadStatus leadStatus" + leadStatusLabels[lead.status].replace(/\s+/g, "")}>
            {leadStatusLabels[lead.status]}
          </span>
          <Link className="btn primary" href={`/dashboard/buy-from-me/leads/${lead.id}/edit`}>
            Edit lead
          </Link>
        </div>
      </div>

      <div className="leadDetailGrid">
        <section className="panel">
          <h2>Contact</h2>
          <dl className="detailList">
            <div><dt>Name</dt><dd>{lead.contact_name}</dd></div>
            <div><dt>Phone</dt><dd>{lead.phone || "—"}</dd></div>
            <div><dt>Email</dt><dd>{lead.email || "—"}</dd></div>
            <div><dt>Source</dt><dd>{leadSourceLabels[lead.source]}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h2>Opportunity</h2>
          <dl className="detailList">
            <div><dt>Service</dt><dd>{lead.service_name ?? "—"}</dd></div>
            <div><dt>Status</dt><dd>{leadStatusLabels[lead.status]}</dd></div>
            <div><dt>Estimated value</dt><dd>{formatLeadValue(lead.estimated_value_pence)}</dd></div>
            <div><dt>Last contact</dt><dd>{formatLeadDate(lead.last_contact_at)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="panel topGap leadStatusPanel">
        <div>
          <h2>Lead status</h2>
          <p className="muted">
            Move this Lead through the sales lifecycle without changing its contact details.
          </p>
        </div>
        <LeadStatusForm leadId={lead.id} currentStatus={lead.status} />
      </section>

      <section className="panel topGap">
        <h2>Enquiry summary</h2>
        <p className="leadSummaryText">{lead.enquiry_summary}</p>
      </section>

      <div className="twoCol topGap">
        <section className="panel">
          <h2>Internal notes</h2>
          <p className="muted">Notes are not enabled yet. They will be added as a separate secured CRM step.</p>
        </section>
        <section className="panel">
          <h2>Quote requests</h2>
          <p className="muted">Quote requests are not enabled yet. They remain separate from the Lead lifecycle.</p>
        </section>
      </div>
    </>
  );
}
