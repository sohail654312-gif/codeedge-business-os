import { leads } from "@/data/demo";

export default function LeadsPage() {
  const potentialValue = leads.reduce((total, lead) => {
    const amount = Number(lead.value.replace(/[£,]/g, ""));
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const newCount = leads.filter((lead) => lead.status === "New").length;
  const qualifiedCount = leads.filter((lead) => lead.status === "Qualified").length;

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Leads</h1>
          <p className="muted">
            Demo enquiries are now flowing into the lead inbox before we connect ERPNext.
          </p>
        </div>
        <button className="btn primary" type="button" disabled title="Enabled in a later step">
          + Add lead
        </button>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">Total leads</div><div className="statValue">{leads.length}</div></div>
        <div className="stat"><div className="statLabel">New</div><div className="statValue">{newCount}</div></div>
        <div className="stat"><div className="statLabel">Qualified</div><div className="statValue">{qualifiedCount}</div></div>
        <div className="stat"><div className="statLabel">Potential value</div><div className="statValue">£{potentialValue.toLocaleString("en-GB")}</div></div>
      </div>

      <section className="panel topGap">
        <div className="leadToolbar">
          <div>
            <h2>Lead inbox</h2>
            <p className="muted leadSubtext">
              Four realistic sample enquiries are loaded so you can see how the lead workspace feels.
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
              {leads.map((lead) => (
                <tr key={lead.name}>
                  <td><b>{lead.name}</b></td>
                  <td>{lead.service}</td>
                  <td>{lead.source}</td>
                  <td>
                    <span className={`leadStatus leadStatus${lead.status.replace(/\s+/g, "")}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td><b>{lead.value}</b></td>
                  <td className="muted">{lead.lastContact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
