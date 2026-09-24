export const conversationChannels = [
  "website_chat",
  "whatsapp",
  "email",
  "sms",
  "voice",
  "internal",
] as const;

export type ConversationChannel = (typeof conversationChannels)[number];

export const conversationChannelLabels: Record<ConversationChannel, string> = {
  website_chat: "Website Chat",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  voice: "AI Voice",
  internal: "Internal",
};

export const conversationStatuses = [
  "open",
  "pending",
  "resolved",
  "closed",
] as const;

export type ConversationStatus = (typeof conversationStatuses)[number];

export const conversationStatusLabels: Record<ConversationStatus, string> = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

export const messageSenderTypes = [
  "customer",
  "staff",
  "ai",
  "system",
] as const;

export type MessageSenderType = (typeof messageSenderTypes)[number];

export const messageDirections = [
  "inbound",
  "outbound",
  "internal",
] as const;

export type MessageDirection = (typeof messageDirections)[number];
