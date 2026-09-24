import Link from "next/link";
import { demoLeads, formatLeadValue } from "@/modules/buy-from-me/leads/demo";
import { leadSourceLabels, leadStatusLabels } from "@/modules/buy-from-me/leads/domain";

export default function LeadsPage() {
  const potentialValue = demoLeads.reduce((total, lead) => total + lead.estimatedValuePence, 0);
  const newCount = demoLeads.filter((lead) => lead.status === "new").length;
  const qualifiedCount = demoLeads.filter((lead) => lead.status === "qualified").length;

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Leads</h1>
          <p className="muted">
            Demo enquiries are now flowing through the canonical Lead domain while the real data layer is built.
          </p>
        </div>
        <button className="btn primary" type="button" disabled title="Enabled in a later step">
          + Add lead
        </button>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">Total leads</div><div className="statValue">{demoLeads.length}</div></div>
        <div className="stat"><div className="statLabel">New</div><div className="statValue">{newCount}</div></div>
        <div className="stat"><div className="statLabel">Qualified</div><div className="statValue">{qualifiedCount}</div></div>
        <div className="stat"><div className="statLabel">Potential value</div><div className="statValue">{formatLeadValue(potentialValue)}</div></div>
      </div>

      <section className="panel topGap">
        <div className="leadToolbar">
          <div>
            <h2>Lead inbox</h2>
            <p className="muted leadSubtext">
              Open any lead to review its contact, enquiry and opportunity details.
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
              {demoLeads.map((lead) => {
                const statusLabel = leadStatusLabels[lead.status];
                return (
                  <tr key={lead.id}>
                    <td>
                      <Link className="leadNameLink" href={`/dashboard/buy-from-me/leads/${lead.id}`}>
                        {lead.contactName}
                      </Link>
                    </td>
                    <td>{lead.serviceName}</td>
                    <td>{leadSourceLabels[lead.source]}</td>
                    <td>
                      <span className={`leadStatus leadStatus${statusLabel.replace(/\s+/g, "")}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td><b>{formatLeadValue(lead.estimatedValuePence)}</b></td>
                    <td className="muted">{lead.lastContactLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
