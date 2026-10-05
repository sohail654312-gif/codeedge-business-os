import Link from "next/link";
import { getCustomerDirectoryData } from "@/modules/buy-from-me/customers/data";
import { requireDashboardTenant } from "@/server/auth/session";
import { pageSchema,pageHref } from "@/modules/buy-from-me/pagination";
import { z } from "zod";

export default async function CustomersPage({ searchParams }: { searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  const { client, context } = await requireDashboardTenant();
  const query = await searchParams;
  const q = z.string().trim().max(120).catch("").parse(Array.isArray(query.q) ? query.q[0] : query.q) || null;
  const page = pageSchema.parse(query.page);
  const directory = await getCustomerDirectoryData(client, context.business.id,q,page);
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
          <Link className="btn primary" href="/dashboard/buy-from-me/customers/new">
            + Add customer
          </Link>
        </div>
      </div>

      <div className="statGrid compact">
        <div className="stat"><div className="statLabel">{q ? "Matching customers" : "Total customers"}</div><div className="statValue">{directory.total}</div></div>
        <div className="stat"><div className="statLabel">Active on this page</div><div className="statValue">{activeCount}</div></div>
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
          <form className="customerFilters" method="get">
            <input aria-label="Search customers" name="q" className="customerSearch" placeholder="Name, phone or email" maxLength={120} defaultValue={q ?? ""} />
            <button className="btn" type="submit">Search</button>
            {q ? <Link href="/dashboard/buy-from-me/customers">Reset</Link> : null}
          </form>
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
                  <td><Link href={`/dashboard/buy-from-me/customers/${customer.id}/edit`}>{customer.name}</Link></td>
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
                      <Link className="backLink" href={`/dashboard/bookings?customer=${customer.id}`}>View</Link>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8}><div className="emptyState"><h3>No Customers yet</h3><p>Convert a Lead to create a Customer.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <nav aria-label="Customer pages" className="row topGap">
          <span>Page {page} · {directory.total} matching Customers · {directory.pageSize} per page</span>
          {page > 1 ? <Link className="btn" href={pageHref("/dashboard/buy-from-me/customers",{q},page-1)}>Previous</Link> : null}
          {page*directory.pageSize < directory.total ? <Link className="btn" href={pageHref("/dashboard/buy-from-me/customers",{q},page+1)}>Next</Link> : null}
        </nav>
      </section>
    </>
  );
}
