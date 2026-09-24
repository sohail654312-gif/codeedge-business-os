import { getCustomerDirectoryData } from "@/modules/buy-from-me/customers/data";

export default async function CustomersPage() {
  const directory = await getCustomerDirectoryData();
  const isLive = directory.mode === "erpnext";
  const activeCount = directory.rows.filter((customer) => customer.status === "Active").length;

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Customers</h1>
          <p className="muted">{directory.note}</p>
        </div>
        <div className="row">
          <span className="pill">{isLive ? "ERPNext live" : "Demo fallback"}</span>
          <button className="btn primary" type="button" disabled title="Enabled in a later step">
            + Add customer
          </button>
        </div>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">Total customers</div><div className="statValue">{directory.rows.length}</div></div>
        <div className="stat"><div className="statLabel">Active</div><div className="statValue">{activeCount}</div></div>
        <div className="stat"><div className="statLabel">New this month</div><div className="statValue">{isLive ? "—" : "1"}</div></div>
        <div className="stat"><div className="statLabel">Customer value</div><div className="statValue">{isLive ? "—" : "£7,990"}</div></div>
      </div>

      <section className="panel topGap">
        <div className="customerToolbar">
          <div>
            <h2>Customer directory</h2>
            <p className="muted customerSubtext">
              {isLive
                ? "Live customer records are coming from ERPNext."
                : "Demo records remain visible until ERPNext credentials are configured and reachable."}
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
                <th>Company / Group</th>
                <th>Contact / Territory</th>
                <th>Status</th>
                <th>Source</th>
                <th>Value</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {directory.rows.map((customer) => (
                <tr key={`${customer.name}-${customer.source}`}>
                  <td><b>{customer.name}</b></td>
                  <td>{customer.company}</td>
                  <td className="muted">{customer.contact}</td>
                  <td>
                    <span className={`customerStatus customerStatus${customer.status.replace(/\s+/g, "")}`}>
                      {customer.status}
                    </span>
                  </td>
                  <td>{customer.source}</td>
                  <td><b>{customer.value}</b></td>
                  <td className="muted">{customer.lastActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
