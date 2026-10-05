import { randomUUID } from "node:crypto";
import { CustomerForm } from "@/components/CustomerForm";
import { requireDashboardTenant } from "@/server/auth/session";
export default async function NewCustomerPage() {
  await requireDashboardTenant();
  return <><h1>Add Customer</h1><CustomerForm id={randomUUID()} /></>;
}
