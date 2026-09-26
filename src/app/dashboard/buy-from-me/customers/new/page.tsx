import Link from "next/link";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function NewCustomerPage() {
  await requireDashboardTenant();
  return (
    <>
      <Link className="backLink" href="/dashboard/buy-from-me/customers">← Customers</Link>
      <div className="pageHead topGap">
        <div>
          <div className="eyebrow">Buy From Me</div>
          <h1>Add customer</h1>
          <p className="muted">Create a canonical CRM Customer without manufacturing a Lead.</p>
        </div>
      </div>
      <CustomerForm />
    </>
  );
}
