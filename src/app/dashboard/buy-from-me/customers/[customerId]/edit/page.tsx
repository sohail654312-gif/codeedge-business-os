import { notFound } from "next/navigation";
import { z } from "zod";
import { CustomerForm } from "@/components/CustomerForm";
import { requireDashboardTenant } from "@/server/auth/session";
export default async function EditCustomerPage({ params }: { params:Promise<{ customerId:string }> }) {
  const { client,context } = await requireDashboardTenant();
  const { customerId } = await params;
  if (!z.uuid().safeParse(customerId).success) notFound();
  const { data,error } = await client.from("customers").select("id,contact_name,phone,email")
    .eq("business_id",context.business.id).eq("id",customerId).maybeSingle();
  if (error) throw new Error("Unable to load Customer.");
  if (!data) notFound();
  return <><h1>Edit Customer</h1><CustomerForm id={data.id} customer={data} /></>;
}
