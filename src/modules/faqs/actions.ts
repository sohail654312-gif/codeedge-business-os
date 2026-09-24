"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/server/auth/session";
import { faqIdSchema, faqSchema } from "./validation";

export type FaqState = {
  error?: string;
  success?: string;
};

function ownerOnly(role: "owner" | "staff"): FaqState | null {
  return role === "owner" ? null : { error: "Only a business owner can change FAQs." };
}

function revalidateFaqs() {
  revalidatePath("/dashboard/settings");
}

function parseFaq(formData: FormData) {
  return faqSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
    is_active: formData.get("is_active") === "on",
    display_order: formData.get("display_order"),
  });
}

export async function createFaq(
  _state: FaqState,
  formData: FormData,
): Promise<FaqState> {
  const parsed = parseFaq(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the FAQ details." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("business_faqs")
    .insert({ ...parsed.data, business_id: context.business.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Unable to create the FAQ. Check your owner access and try again." };
  }

  revalidateFaqs();
  return { success: "FAQ created." };
}

export async function updateFaq(
  _state: FaqState,
  formData: FormData,
): Promise<FaqState> {
  const id = faqIdSchema.safeParse(formData.get("faq_id"));
  const parsed = parseFaq(formData);

  if (!id.success || !parsed.success) {
    return {
      error: parsed.success
        ? "Invalid FAQ."
        : parsed.error.issues[0]?.message ?? "Check the FAQ details.",
    };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("business_faqs")
    .update(parsed.data)
    .eq("business_id", context.business.id)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "FAQ unavailable in this workspace or could not be updated." };
  }

  revalidateFaqs();
  return { success: "FAQ saved." };
}

export async function deleteFaq(
  _state: FaqState,
  formData: FormData,
): Promise<FaqState> {
  const id = faqIdSchema.safeParse(formData.get("faq_id"));
  if (!id.success) return { error: "Invalid FAQ." };

  const { client, context } = await requireDashboardTenant();
  const denied = ownerOnly(context.role);
  if (denied) return denied;

  const { data, error } = await client
    .from("business_faqs")
    .delete()
    .eq("business_id", context.business.id)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "FAQ unavailable in this workspace or could not be deleted." };
  }

  revalidateFaqs();
  return { success: "FAQ deleted." };
}
