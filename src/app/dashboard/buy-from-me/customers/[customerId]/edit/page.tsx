import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { getCustomer } from "@/modules/buy-from-me/customers/data";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function EditCustomerPage({
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
      <Link className="backLink" href={`/dashboard/buy-from-me/customers/${customer.id}`}>← Customer</Link>
      <div className="pageHead topGap">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Edit customer</h1>
          <p className="muted">Update the canonical CRM contact record for this workspace.</p>
        </div>
      </div>
      <CustomerForm customer={customer} />
    </>
  );
}
