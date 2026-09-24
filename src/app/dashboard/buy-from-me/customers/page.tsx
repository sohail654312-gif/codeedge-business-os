import { customers } from "@/data/demo";

export default function CustomersPage() {
  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Customers</h1>
          <p className="muted">
            Demo customer records are shown here before the ERPNext connection replaces them with live data.
          </p>
        </div>
        <button className="btn primary" type="button" disabled title="Enabled in a later step">
          + Add customer
        </button>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">Total customers</div><div className="statValue">4</div></div>
        <div className="stat"><div className="statLabel">Active</div><div className="statValue">3</div></div>
        <div className="stat"><div className="statLabel">New this month</div><div className="statValue">1</div></div>
        <div className="stat"><div className="statLabel">Customer value</div><div className="statValue">£7,990</div></div>
      </div>

      <section className="panel topGap">
        <div className="customerToolbar">
          <div>
            <h2>Customer directory</h2>
            <p className="muted customerSubtext">
              Four sample customers are loaded so you can see the finished directory before ERPNext goes live.
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
              {customers.map((customer) => (
                <tr key={customer.name}>
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
