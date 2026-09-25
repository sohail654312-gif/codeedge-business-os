import { z } from "zod";
import { conversationChannels } from "@/modules/contact-me/conversations/domain";
import { leadStatuses, leadSources } from "@/modules/buy-from-me/leads/domain";
import {
  automationTriggerTypes,
  type AutomationEventPayload,
  type AutomationTriggerType,
} from "./domain";

const uuid = z.string().uuid();

const registrations = {
  "lead.created": z.object({
    lead: z.object({
      id: uuid,
      status: z.enum(leadStatuses),
      source: z.enum(leadSources),
      service_id: uuid.nullable(),
      estimated_value_pence: z.number().int().nullable(),
    }).passthrough(),
  }).passthrough(),

  "lead.status_changed": z.object({
    lead: z.object({
      id: uuid,
      status: z.enum(leadStatuses),
      previous_status: z.enum(leadStatuses),
      source: z.enum(leadSources),
      service_id: uuid.nullable(),
    }).passthrough(),
  }).passthrough(),

  "conversation.created": z.object({
    conversation: z.object({
      id: uuid,
      channel: z.enum(conversationChannels),
      status: z.string().min(1),
      lead_id: uuid.nullable(),
      customer_id: uuid.nullable(),
    }).passthrough(),
  }).passthrough(),

  "message.received": z.object({
    message: z.object({
      id: uuid,
      sender_type: z.string().min(1),
      direction: z.literal("inbound"),
    }).passthrough(),
    conversation: z.object({
      id: uuid,
      channel: z.enum(conversationChannels),
    }).passthrough(),
  }).passthrough(),

  "appointment.created": appointmentPayload(),
  "appointment.confirmed": appointmentPayload(),
  "appointment.rescheduled": appointmentPayload(),
  "appointment.cancelled": appointmentPayload(),

  "voice.call.completed": voicePayload("completed"),
  "voice.call.failed": voicePayload("failed"),
  "voice.handoff.requested": z.object({
    voice: z.object({
      id: uuid,
      status: z.string().min(1),
      direction: z.enum(["inbound", "outbound"]),
      conversation_id: uuid,
      lead_id: uuid.nullable(),
    }).passthrough(),
  }).passthrough(),
} satisfies Record<AutomationTriggerType, z.ZodType<AutomationEventPayload>>;

function appointmentPayload() {
  return z.object({
    appointment: z.object({
      id: uuid,
      status: z.string().min(1),
      service_id: uuid.nullable(),
      lead_id: uuid.nullable(),
      customer_id: uuid.nullable(),
      starts_at: z.string().datetime({ offset: true }),
      ends_at: z.string().datetime({ offset: true }),
    }).passthrough(),
  }).passthrough();
}

function voicePayload(expectedStatus: "completed" | "failed") {
  return z.object({
    voice: z.object({
      id: uuid,
      status: z.literal(expectedStatus),
      direction: z.enum(["inbound", "outbound"]),
      conversation_id: uuid,
      lead_id: uuid.nullable(),
      handoff_required: z.boolean(),
    }).passthrough(),
  }).passthrough();
}

export function isAutomationTriggerType(
  value: string,
): value is AutomationTriggerType {
  return (automationTriggerTypes as readonly string[]).includes(value);
}

export function validateAutomationEvent(
  eventType: string,
  payload: unknown,
): AutomationEventPayload {
  if (!isAutomationTriggerType(eventType)) {
    throw new Error("automation_unknown_trigger");
  }

  const parsed = registrations[eventType].safeParse(payload);
  if (!parsed.success) {
    throw new Error("automation_invalid_event_payload");
  }

  return parsed.data;
}

export const automationTriggerRegistry = Object.freeze(
  Object.fromEntries(
    automationTriggerTypes.map((type) => [
      type,
      { type, source: type.split(".")[0] },
    ]),
  ) as Record<AutomationTriggerType, { type: AutomationTriggerType; source: string }>,
);
