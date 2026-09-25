import { z } from "zod";
import { leadStatuses } from "@/modules/buy-from-me/leads/domain";

export const automationTriggerTypes = [
  "lead.created",
  "lead.status_changed",
  "conversation.created",
  "message.received",
  "appointment.created",
  "appointment.confirmed",
  "appointment.rescheduled",
  "appointment.cancelled",
  "voice.call.completed",
  "voice.call.failed",
  "voice.handoff.requested",
] as const;

export type AutomationTriggerType = (typeof automationTriggerTypes)[number];

export const conditionPathSchema = z.string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/);

const scalarSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const automationConditionSchema = z.object({
  path: conditionPathSchema,
  operator: z.enum(["eq", "not_eq", "exists", "not_exists"]),
  value: scalarSchema.optional(),
}).strict().superRefine((condition, ctx) => {
  const requiresValue = condition.operator === "eq" || condition.operator === "not_eq";
  if (requiresValue && condition.value === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Condition value is required.",
      path: ["value"],
    });
  }
});

export const automationConditionsSchema = z.array(automationConditionSchema).max(20);

const actionBase = {
  conversationIdPath: conditionPathSchema,
  body: z.string().trim().min(1).max(4000),
};

export const automationActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("crm.update_lead_status"),
    leadIdPath: conditionPathSchema,
    status: z.enum(leadStatuses),
  }).strict(),
  z.object({
    type: z.literal("communication.send_whatsapp"),
    ...actionBase,
  }).strict(),
  z.object({
    type: z.literal("communication.send_email"),
    ...actionBase,
  }).strict(),
  z.object({
    type: z.literal("communication.send_sms"),
    ...actionBase,
  }).strict(),
  z.object({
    type: z.literal("internal.flag_conversation"),
    conversationIdPath: conditionPathSchema,
  }).strict(),
]);

export const automationActionsSchema = z.array(automationActionSchema).min(1).max(20);

export type AutomationCondition = z.infer<typeof automationConditionSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;

export type AutomationEventPayload = Record<string, unknown>;

export type AutomationRunContext = {
  runId: string;
  businessId: string;
  actorUserId: string;
  executionMode: "demo" | "sandbox" | "production";
  correlationId: string;
  payload: AutomationEventPayload;
};
