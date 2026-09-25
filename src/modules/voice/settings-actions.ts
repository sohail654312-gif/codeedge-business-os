"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDashboardTenant } from "@/server/auth/session";
import { receptionistToolNames } from "@/server/voice/receptionist";

export type VoiceSettingsState = { error?: string; success?: string };

const toolSchema = z.enum(receptionistToolNames);

const settingsSchema = z.object({
  enabled: z.boolean(),
  greeting: z.string().trim().min(1).max(500),
  provider: z.enum(["demo_voice", "vapi"]),
  voice: z.string().trim().max(120),
  preferred_language: z.string()
    .trim()
    .regex(/^[A-Za-z]{2,8}([_-][A-Za-z0-9]{2,8})?$/),
  allowed_tools: z.array(toolSchema).min(1),
  handoff_behavior: z.enum(["shared_inbox", "message_only"]),
  additional_instructions: z.string().trim().max(2000),
}).strict();

export async function saveVoiceReceptionistSettings(
  _state: VoiceSettingsState,
  formData: FormData,
): Promise<VoiceSettingsState> {
  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    greeting: formData.get("greeting"),
    provider: formData.get("provider"),
    voice: formData.get("voice"),
    preferred_language: formData.get("preferred_language"),
    allowed_tools: formData.getAll("allowed_tools"),
    handoff_behavior: formData.get("handoff_behavior"),
    additional_instructions: formData.get("additional_instructions"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the Voice settings." };
  }

  const { client, context } = await requireDashboardTenant();
  if (context.role !== "owner") {
    return { error: "Only a business owner can change AI Voice settings." };
  }

  const { error } = await client
    .from("voice_receptionist_settings")
    .upsert({
      business_id: context.business.id,
      ...parsed.data,
    }, { onConflict: "business_id" });

  if (error) return { error: "Unable to save AI Voice settings." };

  revalidatePath("/dashboard/contact-me/voice");
  return { success: "AI Voice settings saved." };
}
