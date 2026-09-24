import Link from "next/link";
import { formatLeadDate, formatLeadValue, listActiveServices, listLeads } from "@/modules/buy-from-me/leads/data";
import { leadSourceLabels, leadSources, leadStatusLabels, leadStatuses } from "@/modules/buy-from-me/leads/domain";
import { hasLeadFilters, parseLeadFilters } from "@/modules/buy-from-me/leads/filters";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { client, context } = await requireDashboardTenant();
  const filters = parseLeadFilters(await searchParams);
  const [leads, services] = await Promise.all([
    listLeads(client, context.business.id, filters),
    listActiveServices(client, context.business.id),
  ]);

  const potentialValue = leads.reduce((total, lead) => total + (lead.estimated_value_pence ?? 0), 0);
  const newCount = leads.filter((lead) => lead.status === "new").length;
  const qualifiedCount = leads.filter((lead) => lead.status === "qualified").length;
  const filtered = hasLeadFilters(filters);

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
        <div className="stat"><div className="statLabel">{filtered ? "Matching leads" : "Total leads"}</div><div className="statValue">{leads.length}</div></div>
        <div className="stat"><div className="statLabel">New</div><div className="statValue">{newCount}</div></div>
        <div className="stat"><div className="statLabel">Qualified</div><div className="statValue">{qualifiedCount}</div></div>
        <div className="stat"><div className="statLabel">Potential value</div><div className="statValue">{formatLeadValue(potentialValue)}</div></div>
      </div>

      <section className="panel topGap">
        <div className="leadToolbar">
          <div>
            <h2>Lead inbox</h2>
            <p className="muted leadSubtext">
              Search and filter tenant-scoped Lead records without loading another workspace.
            </p>
          </div>
        </div>

        <form className="leadFilterForm" method="get">
          <div className="field leadFilterSearch">
            <label htmlFor="q">Search</label>
            <input
              id="q"
              name="q"
              defaultValue={filters.q}
              placeholder="Name, phone, email or enquiry..."
              maxLength={100}
            />
          </div>

          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">All statuses</option>
              {leadStatuses.map((status) => (
                <option key={status} value={status}>{leadStatusLabels[status]}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="source">Source</label>
            <select id="source" name="source" defaultValue={filters.source ?? ""}>
              <option value="">All sources</option>
              {leadSources.map((source) => (
                <option key={source} value={source}>{leadSourceLabels[source]}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="service">Service</label>
            <select id="service" name="service" defaultValue={filters.service ?? ""}>
              <option value="">All services</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
          </div>

          <div className="leadFilterActions">
            <button className="btn primary" type="submit">Apply</button>
            {filtered ? <Link className="btn" href="/dashboard/buy-from-me/leads">Clear</Link> : null}
          </div>
        </form>

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
                      <h3>{filtered ? "No matching Leads" : "No Leads yet"}</h3>
                      <p>
                        {filtered
                          ? "Try changing or clearing the current search and filters."
                          : "Create the first real Lead for this workspace."}
                      </p>
                      {filtered
                        ? <Link className="btn topGap" href="/dashboard/buy-from-me/leads">Clear filters</Link>
                        : <Link className="btn primary topGap" href="/dashboard/buy-from-me/leads/new">+ Add lead</Link>}
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
