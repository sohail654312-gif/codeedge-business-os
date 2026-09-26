"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardTenant } from "@/server/auth/session";
import { customerCreateSchema, customerEditSchema } from "./validation";

export type CustomerFormState = { error?: string };

export async function createCustomer(
  _state: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = customerCreateSchema.safeParse({
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Customer details." };
  }

  const { client, context } = await requireDashboardTenant();
  const { data, error } = await client.from("customers").insert({
    business_id: context.business.id,
    contact_name: parsed.data.contact_name,
    phone: parsed.data.phone,
    email: parsed.data.email,
    source_lead_id: null,
    created_by: context.userId,
  }).select("id").single();

  if (error || !data) return { error: "Unable to create the Customer. Please try again." };

  revalidatePath("/dashboard/buy-from-me/customers");
  redirect(`/dashboard/buy-from-me/customers/${data.id}`);
}

export async function updateCustomer(
  _state: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = customerEditSchema.safeParse({
    customer_id: formData.get("customer_id"),
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Customer details." };
  }

  const { client, context } = await requireDashboardTenant();
  const { data, error } = await client.from("customers").update({
    contact_name: parsed.data.contact_name,
    phone: parsed.data.phone,
    email: parsed.data.email,
  }).eq("business_id", context.business.id)
    .eq("id", parsed.data.customer_id)
    .select("id").maybeSingle();

  if (error) return { error: "Unable to update the Customer. Please try again." };
  if (!data) return { error: "Customer unavailable in this workspace." };

  revalidatePath("/dashboard/buy-from-me/customers");
  revalidatePath(`/dashboard/buy-from-me/customers/${data.id}`);
  redirect(`/dashboard/buy-from-me/customers/${data.id}`);
}
