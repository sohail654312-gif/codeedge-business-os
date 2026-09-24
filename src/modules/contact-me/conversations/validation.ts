import { z } from "zod";
import {
  conversationChannels,
  conversationStatuses,
  messageDirections,
  messageSenderTypes,
} from "./domain";

export const conversationChannelSchema = z.enum(conversationChannels);
export const conversationStatusSchema = z.enum(conversationStatuses);
export const messageSenderTypeSchema = z.enum(messageSenderTypes);
export const messageDirectionSchema = z.enum(messageDirections);

export const conversationIdSchema = z.uuid();
export const messageBodySchema = z.string().trim().min(1, "Message is required.").max(4000);
export const conversationSubjectSchema = z.string().trim().max(200);

export const localMessageFormSchema = z.object({
  conversation_id: z.uuid(),
  message_kind: z.enum(["reply", "internal"]),
  body: messageBodySchema,
  request_id: z.preprocess(
    (value) => typeof value === "string" && value ? value : undefined,
    z.uuid().optional(),
  ),
});

export const conversationStatusFormSchema = z.object({
  conversation_id: z.uuid(),
  status: conversationStatusSchema,
});

export const startLeadConversationSchema = z.object({
  lead_id: z.uuid(),
  subject: conversationSubjectSchema,
});

const firstQueryValue = (value: unknown) => Array.isArray(value) ? value[0] : value;

export const inboxFilterSchema = z.object({
  status: z.preprocess(
    firstQueryValue,
    z.union([conversationStatusSchema, z.literal("")]).catch(""),
  ).transform((value) => value || null),
  channel: z.preprocess(
    firstQueryValue,
    z.union([conversationChannelSchema, z.literal("")]).catch(""),
  ).transform((value) => value || null),
});

export type InboxFilters = z.infer<typeof inboxFilterSchema>;
