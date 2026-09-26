import Link from "next/link";
import { getCustomerDirectoryData } from "@/modules/buy-from-me/customers/data";
import { customerFilterSchema } from "@/modules/buy-from-me/customers/validation";
import { requireDashboardTenant } from "@/server/auth/session";

type CustomerSearchParams = Record<string, string | string[] | undefined>;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerSearchParams>;
}) {
  const { client, context } = await requireDashboardTenant();
  const filters = customerFilterSchema.parse(await searchParams);
  const directory = await getCustomerDirectoryData(client, context.business.id, filters);
  const hasFilters = Boolean(filters.q || filters.source);

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Customers</h1>
          <p className="muted">{directory.note}</p>
        </div>
        <div className="row">
          <span className="pill">Codeedge CRM</span>
          <Link className="btn primary" href="/dashboard/buy-from-me/customers/new">
            + Add customer
          </Link>
        </div>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">{hasFilters ? "Matching customers" : "Customers"}</div><div className="statValue">{directory.rows.length}</div></div>
        <div className="stat"><div className="statLabel">Active</div><div className="statValue">{directory.rows.length}</div></div>
        <div className="stat"><div className="statLabel">CRM source</div><div className="statValue">Codeedge</div></div>
        <div className="stat"><div className="statLabel">Back-office</div><div className="statValue">Optional</div></div>
      </div>

      <section className="panel topGap">
        <h2>Customer directory</h2>
        <p className="muted customerSubtext">
          Direct Customers and converted Leads share one tenant-scoped CRM directory.
        </p>

        <form className="leadFilterForm" method="get">
          <div className="leadFilterSearch">
            <label htmlFor="customer_q">Search</label>
            <input id="customer_q" className="customerSearch" name="q" type="search"
              maxLength={120} defaultValue={filters.q ?? ""}
              placeholder="Name, phone or email..." />
          </div>
          <div>
            <label htmlFor="customer_source">Origin</label>
            <select id="customer_source" name="source" defaultValue={filters.source ?? ""}>
              <option value="">All origins</option>
              <option value="lead">Converted Leads</option>
              <option value="direct">Direct CRM</option>
            </select>
          </div>
          <div className="leadFilterActions">
            <button className="btn primary" type="submit">Apply</button>
            {hasFilters ? <Link className="btn" href="/dashboard/buy-from-me/customers">Reset</Link> : null}
          </div>
        </form>

        <div className="customerTableWrap">
          <table className="customerTable">
            <thead><tr>
              <th>Customer</th><th>Company / Group</th><th>Contact</th><th>Status</th>
              <th>Source</th><th>Value</th><th>Last activity</th><th>Appointments</th>
            </tr></thead>
            <tbody>
              {directory.rows.length ? directory.rows.map((customer) => (
                <tr key={customer.id}>
                  <td><Link className="leadNameLink" href={`/dashboard/buy-from-me/customers/${customer.id}`}><b>{customer.name}</b></Link></td>
                  <td>{customer.company}</td>
                  <td className="muted">{customer.contact}</td>
                  <td><span className="customerStatus customerStatusActive">{customer.status}</span></td>
                  <td>{customer.source}</td><td><b>{customer.value}</b></td>
                  <td className="muted">{customer.lastActivity}</td>
                  <td><Link className="backLink" href={`/dashboard/bookings?customer=${customer.id}`}>View</Link></td>
                </tr>
              )) : (
                <tr><td colSpan={8}><div className="emptyState">
                  <h3>{hasFilters ? "No matching Customers" : "No Customers yet"}</h3>
                  <p>{hasFilters ? "Try a different search or reset the filters." : "Create a Customer directly or convert a Lead."}</p>
                </div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
