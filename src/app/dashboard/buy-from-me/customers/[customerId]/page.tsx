import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/modules/buy-from-me/customers/data";
import { requireDashboardTenant } from "@/server/auth/session";

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const { client, context } = await requireDashboardTenant();
  const customer = await getCustomer(client, context.business.id, customerId);
  if (!customer) notFound();

  return (
    <>
      <div className="pageHead">
        <div>
          <Link className="backLink" href="/dashboard/buy-from-me/customers">← Customers</Link>
          <div className="eyebrow topGap">Customer details</div>
          <h1>{customer.contact_name}</h1>
          <p className="muted">Canonical tenant-scoped Codeedge CRM identity.</p>
        </div>
        <Link className="btn primary" href={`/dashboard/buy-from-me/customers/${customer.id}/edit`}>
          Edit customer
        </Link>
      </div>

      <div className="twoCol">
        <section className="panel">
          <h2>Contact</h2>
          <dl className="detailList">
            <div><dt>Name</dt><dd>{customer.contact_name}</dd></div>
            <div><dt>Phone</dt><dd>{customer.phone || "—"}</dd></div>
            <div><dt>Email</dt><dd>{customer.email || "—"}</dd></div>
          </dl>
        </section>
        <section className="panel">
          <h2>CRM origin</h2>
          <dl className="detailList">
            <div><dt>Origin</dt><dd>{customer.source_lead_id ? "Converted Lead" : "Direct CRM"}</dd></div>
            <div><dt>Finance mapping</dt><dd>{customer.erpnext_customer_id || "Not mapped"}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(customer.created_at, context.business.timezone)}</dd></div>
            <div><dt>Updated</dt><dd>{formatDate(customer.updated_at, context.business.timezone)}</dd></div>
          </dl>
        </section>
      </div>

      <div className="row topGap">
        {customer.source_lead_id ? (
          <Link className="btn" href={`/dashboard/buy-from-me/leads/${customer.source_lead_id}`}>View source Lead</Link>
        ) : null}
        <Link className="btn" href={`/dashboard/bookings?customer=${customer.id}`}>View appointments</Link>
      </div>
    </>
  );
}
