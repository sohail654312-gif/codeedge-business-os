"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardTenant } from "@/server/auth/session";
import { leadCreateFormSchema } from "./validation";
import { buildLeadInsert } from "./persistence";

export type LeadFormState = {
  error?: string;
};

export async function createLead(
  _state: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const parsed = leadCreateFormSchema.safeParse({
    contact_name: formData.get("contact_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    source: formData.get("source"),
    service_id: formData.get("service_id"),
    enquiry_summary: formData.get("enquiry_summary"),
    estimated_value_gbp: formData.get("estimated_value_gbp"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Lead details." };
  }

  const { client, context } = await requireDashboardTenant();

  if (parsed.data.service_id) {
    const { data: service, error: serviceError } = await client
      .from("services")
      .select("id")
      .eq("business_id", context.business.id)
      .eq("id", parsed.data.service_id)
      .eq("active", true)
      .maybeSingle();

    if (serviceError || !service) {
      return { error: "Select a valid active service for this business." };
    }
  }

  const payload = buildLeadInsert(parsed.data, {
    businessId: context.business.id,
    userId: context.userId,
  });

  const { data: lead, error } = await client
    .from("leads")
    .insert(payload)
    .select("id")
    .single();

  if (error || !lead) {
    return { error: "Unable to save the Lead. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/buy-from-me");
  revalidatePath("/dashboard/buy-from-me/leads");
  redirect(`/dashboard/buy-from-me/leads/${lead.id}`);
}
