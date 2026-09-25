"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { leadStatuses } from "@/modules/buy-from-me/leads/domain";
import { requireDashboardTenant } from "@/server/auth/session";
import {
  automationActionsSchema,
  automationConditionsSchema,
  automationTriggerTypes,
  type AutomationAction,
  type AutomationCondition,
} from "@/server/automation/domain";

export type AutomationFormState = {
  error?: string;
  success?: string;
};

const actionTypes = [
  "crm.update_lead_status",
  "communication.send_whatsapp",
  "communication.send_email",
  "communication.send_sms",
  "internal.flag_conversation",
] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  trigger_type: z.enum(automationTriggerTypes),
  condition_path: z.string().trim().max(120),
  condition_operator: z.enum(["eq", "not_eq", "exists", "not_exists"]),
  condition_value: z.string().max(500),
  action_type: z.enum(actionTypes),
  lead_id_path: z.string().trim().max(120),
  lead_status: z.enum(leadStatuses),
  conversation_id_path: z.string().trim().max(120),
  message_body: z.string().trim().max(4000),
}).strict();

function ownerDenied(role: "owner" | "staff") {
  return role === "owner" ? null : {
    error: "Only the business owner can change Automation workflows.",
  };
}

function buildConditions(data: z.infer<typeof createSchema>): AutomationCondition[] {
  if (!data.condition_path) return [];
  const raw = {
    path: data.condition_path,
    operator: data.condition_operator,
    ...(
      data.condition_operator === "exists" || data.condition_operator === "not_exists"
        ? {}
        : { value: data.condition_value }
    ),
  };
  return automationConditionsSchema.parse([raw]);
}

function buildActions(data: z.infer<typeof createSchema>): AutomationAction[] {
  let action: AutomationAction;
  switch (data.action_type) {
    case "crm.update_lead_status":
      action = {
        type: data.action_type,
        leadIdPath: data.lead_id_path,
        status: data.lead_status,
      };
      break;
    case "internal.flag_conversation":
      action = {
        type: data.action_type,
        conversationIdPath: data.conversation_id_path,
      };
      break;
    default:
      action = {
        type: data.action_type,
        conversationIdPath: data.conversation_id_path,
        body: data.message_body,
      };
  }
  return automationActionsSchema.parse([action]);
}

export async function createAutomationWorkflow(
  _state: AutomationFormState,
  formData: FormData,
): Promise<AutomationFormState> {
  const parsed = createSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    trigger_type: formData.get("trigger_type"),
    condition_path: formData.get("condition_path") ?? "",
    condition_operator: formData.get("condition_operator") ?? "eq",
    condition_value: formData.get("condition_value") ?? "",
    action_type: formData.get("action_type"),
    lead_id_path: formData.get("lead_id_path") ?? "lead.id",
    lead_status: formData.get("lead_status") ?? "contacted",
    conversation_id_path: formData.get("conversation_id_path") ?? "conversation.id",
    message_body: formData.get("message_body") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the workflow." };
  }

  let conditions: AutomationCondition[];
  let actions: AutomationAction[];
  try {
    conditions = buildConditions(parsed.data);
    actions = buildActions(parsed.data);
  } catch {
    return { error: "The workflow condition or action is not valid for Codeedge Automation." };
  }

  const { client, context } = await requireDashboardTenant();
  const denied = ownerDenied(context.role);
  if (denied) return denied;

  const result = await client
    .from("automation_workflows")
    .insert({
      business_id: context.business.id,
      name: parsed.data.name,
      description: parsed.data.description,
      enabled: formData.get("enabled") === "on",
      trigger_type: parsed.data.trigger_type,
      conditions,
      actions,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (result.error || !result.data) {
    return { error: "Unable to create the Automation workflow." };
  }

  revalidatePath("/dashboard/automations");
  revalidatePath("/dashboard");
  return { success: "Automation workflow created." };
}

export async function setAutomationWorkflowEnabled(
  _state: AutomationFormState,
  formData: FormData,
): Promise<AutomationFormState> {
  const parsed = z.object({
    workflow_id: z.string().uuid(),
    enabled: z.enum(["true", "false"]),
  }).safeParse({
    workflow_id: formData.get("workflow_id"),
    enabled: formData.get("enabled"),
  });
  if (!parsed.success) return { error: "Invalid Automation workflow request." };

  const { client, context } = await requireDashboardTenant();
  const denied = ownerDenied(context.role);
  if (denied) return denied;

  const result = await client
    .from("automation_workflows")
    .update({ enabled: parsed.data.enabled === "true" })
    .eq("business_id", context.business.id)
    .eq("id", parsed.data.workflow_id)
    .select("id")
    .maybeSingle();

  if (result.error || !result.data) {
    return { error: "Unable to update the Automation workflow." };
  }

  revalidatePath("/dashboard/automations");
  revalidatePath("/dashboard");
  return { success: parsed.data.enabled === "true" ? "Workflow enabled." : "Workflow disabled." };
}
