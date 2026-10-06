"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardTenant } from "@/server/auth/session";
import { customerFormSchema } from "./validation";

export type CustomerFormState = { error?: string };
async function save(formData: FormData, edit: boolean): Promise<CustomerFormState> {
  const parsed = customerFormSchema.safeParse(Object.fromEntries(
    ["customer_id","contact_name","phone","email"].map(key => [key,formData.get(key)]),
  ));
  if (!parsed.success) return { error: "Check the Customer name and contact details." };
  const { client,context } = await requireDashboardTenant();
  const { customer_id,...contact } = parsed.data;
  const query = edit
    ? client.from("customers").update(contact).eq("business_id",context.business.id).eq("id",customer_id)
    : client.from("customers").insert({ ...contact,id:customer_id,business_id:context.business.id,created_by:context.userId });
  const { data,error } = await query.select("id").maybeSingle();
  if (error || !data) return { error: "Customer could not be saved in this workspace. A repeated creation does not create another Customer." };
  revalidatePath("/dashboard/buy-from-me/customers");
  revalidatePath(`/dashboard/buy-from-me/customers/${customer_id}/edit`);
  redirect("/dashboard/buy-from-me/customers");
}
export async function createCustomer(_state: CustomerFormState,formData: FormData) { return save(formData,false); }
export async function updateCustomer(_state: CustomerFormState,formData: FormData) { return save(formData,true); }
