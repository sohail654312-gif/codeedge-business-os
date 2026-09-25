import { getCustomerDirectoryData } from "@/modules/buy-from-me/customers/data";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function CustomersPage() {
  const { client, context } = await requireDashboardTenant();
  const directory = await getCustomerDirectoryData(client, context.business.id);
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
          <span className="pill">
            {directory.mode === "hybrid" ? "CodeEdge + ERPNext" : directory.mode === "erpnext" ? "ERPNext live" : "CodeEdge CRM"}
          </span>
          <button className="btn primary" type="button" disabled title="Direct customer creation is not enabled yet">
            + Add customer
          </button>
        </div>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">Total customers</div><div className="statValue">{directory.rows.length}</div></div>
        <div className="stat"><div className="statLabel">Active</div><div className="statValue">{activeCount}</div></div>
        <div className="stat"><div className="statLabel">CRM source</div><div className="statValue">{directory.mode === "erpnext" ? "ERPNext" : "CodeEdge"}</div></div>
        <div className="stat"><div className="statLabel">Back-office</div><div className="statValue">{directory.mode === "crm" ? "Optional" : "Connected"}</div></div>
      </div>

      <section className="panel topGap">
        <div className="customerToolbar">
          <div>
            <h2>Customer directory</h2>
            <p className="muted customerSubtext">
              Converted Leads remain visible in CodeEdge even when the back-office adapter is unavailable.
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
                <th>Appointments</th>
              </tr>
            </thead>
            <tbody>
              {directory.rows.length ? directory.rows.map((customer) => (
                <tr key={customer.id}>
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
                  <td>
                    {customer.id.startsWith("erpnext:") ? (
                      <span className="muted">—</span>
                    ) : (
                      <a className="backLink" href={`/dashboard/bookings?customer=${customer.id}`}>View</a>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8}><div className="emptyState"><h3>No Customers yet</h3><p>Convert a Lead to create a Customer.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
