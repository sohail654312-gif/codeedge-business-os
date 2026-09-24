export default function LeadsPage() {
  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Leads</h1>
          <p className="muted">
            A dedicated workspace for new enquiries before they become customers.
          </p>
        </div>
        <button className="btn primary" type="button" disabled title="Enabled in a later step">
          + Add lead
        </button>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">Total leads</div><div className="statValue">0</div></div>
        <div className="stat"><div className="statLabel">New</div><div className="statValue">0</div></div>
        <div className="stat"><div className="statLabel">Qualified</div><div className="statValue">0</div></div>
        <div className="stat"><div className="statLabel">Potential value</div><div className="statValue">£0</div></div>
      </div>

      <section className="panel topGap">
        <div className="leadToolbar">
          <div>
            <h2>Lead inbox</h2>
            <p className="muted leadSubtext">
              Part A creates the Leads workspace only. Demo enquiries will arrive in the next step.
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
              <tr>
                <td colSpan={6}>
                  <div className="emptyState">
                    <div className="emptyIcon">↗</div>
                    <h3>No leads yet</h3>
                    <p>
                      This is the new CodeEdge lead inbox. Part B will add a small set of realistic
                      demo enquiries so you can see the workflow before ERPNext is connected.
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
