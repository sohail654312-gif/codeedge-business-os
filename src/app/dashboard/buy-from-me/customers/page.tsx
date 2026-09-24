export default function CustomersPage() {
  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Customers</h1>
          <p className="muted">
            The customer view for CodeEdge. Demo records will be added in the next step.
          </p>
        </div>
        <button className="btn primary" type="button" disabled title="Enabled in a later step">
          + Add customer
        </button>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">Total customers</div><div className="statValue">0</div></div>
        <div className="stat"><div className="statLabel">Active</div><div className="statValue">0</div></div>
        <div className="stat"><div className="statLabel">New this month</div><div className="statValue">0</div></div>
        <div className="stat"><div className="statLabel">Customer value</div><div className="statValue">£0</div></div>
      </div>

      <section className="panel topGap">
        <div className="customerToolbar">
          <div>
            <h2>Customer directory</h2>
            <p className="muted customerSubtext">
              This screen is ready for demo data first, then ERPNext customer records.
            </p>
          </div>
          <div className="customerFilters">
            <input className="customerSearch" placeholder="Search customers..." disabled />
            <button className="btn" type="button" disabled>Filter</button>
          </div>
        </div>

        <div className="customerTableWrap">
          <table className="customerTable">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Source</th>
                <th>Value</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7}>
                  <div className="emptyState">
                    <div className="emptyIcon">◎</div>
                    <h3>No customers yet</h3>
                    <p>
                      Part A creates the customer workspace only. Part B will add a few demo customers
                      so you can see the screen come alive before we connect ERPNext.
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
