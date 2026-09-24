import Link from "next/link";
import { formatLeadDate, formatLeadValue, listLeads } from "@/modules/buy-from-me/leads/data";
import { leadSourceLabels, leadStatusLabels } from "@/modules/buy-from-me/leads/domain";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function LeadsPage() {
  const { client, context } = await requireDashboardTenant();
  const leads = await listLeads(client, context.business.id);
  const potentialValue = leads.reduce((total, lead) => total + (lead.estimated_value_pence ?? 0), 0);
  const newCount = leads.filter((lead) => lead.status === "new").length;
  const qualifiedCount = leads.filter((lead) => lead.status === "qualified").length;

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Leads</h1>
          <p className="muted">
            Real CRM Leads for {context.business.name}, protected by the active tenant membership.
          </p>
        </div>
        <Link className="btn primary" href="/dashboard/buy-from-me/leads/new">
          + Add lead
        </Link>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">Total leads</div><div className="statValue">{leads.length}</div></div>
        <div className="stat"><div className="statLabel">New</div><div className="statValue">{newCount}</div></div>
        <div className="stat"><div className="statLabel">Qualified</div><div className="statValue">{qualifiedCount}</div></div>
        <div className="stat"><div className="statLabel">Potential value</div><div className="statValue">{formatLeadValue(potentialValue)}</div></div>
      </div>

      <section className="panel topGap">
        <div className="leadToolbar">
          <div>
            <h2>Lead inbox</h2>
            <p className="muted leadSubtext">
              Open any Lead to review its contact, enquiry and opportunity details.
            </p>
          </div>
          <div className="leadFilters">
            <input className="leadSearch" placeholder="Search leads..." disabled />
            <button className="btn" type="button" disabled>Filter</button>
          </div>
        </div>

        <div className="leadTableWrap">
          <table className="leadTable">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Service</th>
                <th>Source</th>
                <th>Status</th>
                <th>Value</th>
                <th>Last contact</th>
              </tr>
            </thead>
            <tbody>
              {leads.length ? leads.map((lead) => {
                const statusLabel = leadStatusLabels[lead.status];
                return (
                  <tr key={lead.id}>
                    <td>
                      <Link className="leadNameLink" href={`/dashboard/buy-from-me/leads/${lead.id}`}>
                        {lead.contact_name}
                      </Link>
                    </td>
                    <td>{lead.service_name ?? "—"}</td>
                    <td>{leadSourceLabels[lead.source]}</td>
                    <td>
                      <span className={`leadStatus leadStatus${statusLabel.replace(/\s+/g, "")}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td><b>{formatLeadValue(lead.estimated_value_pence)}</b></td>
                    <td className="muted">{formatLeadDate(lead.last_contact_at)}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6}>
                    <div className="emptyState">
                      <div className="emptyIcon">↗</div>
                      <h3>No Leads yet</h3>
                      <p>Create the first real Lead for this workspace.</p>
                      <Link className="btn primary topGap" href="/dashboard/buy-from-me/leads/new">+ Add lead</Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
