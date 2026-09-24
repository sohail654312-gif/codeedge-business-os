import "server-only";

import { createWebsiteChatCapabilityClient } from "./capability";
import {
  hashVisitorSessionToken,
} from "./session";
import { validateWebsiteChatContact } from "@/modules/website-chat/validation";
import type { ConversationStatus, MessageDirection, MessageSenderType } from "@/modules/contact-me/conversations/domain";

export type PublicWebsiteChatMessage = {
  sender: "visitor" | "team" | "ai" | "system";
  direction: Exclude<MessageDirection, "internal">;
  body: string;
  created_at: string;
};

export type PublicWebsiteChatConfig = {
  available: boolean;
  widgetName: string;
  launcherLabel: string;
  greetingText: string;
  welcomeMessage: string;
  offlineMessage: string;
  leadCaptureEnabled: boolean;
  accentColor: string;
};

export type PublicWebsiteChatState = {
  config?: PublicWebsiteChatConfig;
  messages: PublicWebsiteChatMessage[];
  contactSaved: boolean;
  status: ConversationStatus | null;
};

function publicSender(sender: MessageSenderType): PublicWebsiteChatMessage["sender"] {
  if (sender === "customer") return "visitor";
  if (sender === "staff") return "team";
  return sender;
}

async function history(widgetId: string, sessionHash: string): Promise<PublicWebsiteChatMessage[]> {
  const client = createWebsiteChatCapabilityClient();
  const { data, error } = await client.rpc("website_chat_history", {
    p_widget_id: widgetId,
    p_session_hash: sessionHash,
  });

  if (error) throw new Error("Chat unavailable");

  return (data ?? []).map((message) => ({
    sender: publicSender(message.sender_type),
    direction: message.direction === "internal" ? "outbound" : message.direction,
    body: message.body,
    created_at: message.created_at,
  }));
}

export async function startWebsiteChat(
  widgetId: string,
  token: string,
): Promise<PublicWebsiteChatState> {
  const client = createWebsiteChatCapabilityClient();
  const sessionHash = hashVisitorSessionToken(token);

  const { data, error } = await client.rpc("website_chat_start", {
    p_widget_id: widgetId,
    p_session_hash: sessionHash,
  });

  if (error || !data?.[0]) throw new Error("Chat unavailable");

  const row = data[0];
  const config: PublicWebsiteChatConfig = {
    available: row.available,
    widgetName: row.widget_name,
    launcherLabel: row.launcher_label,
    greetingText: row.greeting_text,
    welcomeMessage: row.welcome_message,
    offlineMessage: row.offline_message,
    leadCaptureEnabled: row.lead_capture_enabled,
    accentColor: row.accent_color,
  };

  if (!row.available) {
    return {
      config,
      messages: [],
      contactSaved: false,
      status: null,
    };
  }

  return {
    config,
    messages: await history(widgetId, sessionHash),
    contactSaved: row.contact_saved,
    status: null,
  };
}

export async function getWebsiteChatHistory(
  widgetId: string,
  token: string,
): Promise<PublicWebsiteChatState> {
  const client = createWebsiteChatCapabilityClient();
  const sessionHash = hashVisitorSessionToken(token);

  const [statusResult, messages] = await Promise.all([
    client.rpc("website_chat_status", {
      p_widget_id: widgetId,
      p_session_hash: sessionHash,
    }),
    history(widgetId, sessionHash),
  ]);

  if (statusResult.error || !statusResult.data?.[0]) {
    throw new Error("Chat unavailable");
  }

  const row = statusResult.data[0];
  return {
    messages,
    contactSaved: row.contact_saved,
    status: row.conversation_status,
  };
}

export async function sendWebsiteChatMessage(
  widgetId: string,
  token: string,
  requestId: string,
  body: string,
) {
  const client = createWebsiteChatCapabilityClient();
  const sessionHash = hashVisitorSessionToken(token);

  const { error } = await client.rpc("website_chat_send", {
    p_widget_id: widgetId,
    p_session_hash: sessionHash,
    p_request_id: requestId,
    p_body: body,
  });

  if (error) throw new Error("Chat unavailable");
  return getWebsiteChatHistory(widgetId, token);
}

export async function captureWebsiteChatLead(
  widgetId: string,
  token: string,
  input: { contact_name: string; phone: string; email: string },
) {
  const contact = validateWebsiteChatContact(input);
  const client = createWebsiteChatCapabilityClient();
  const sessionHash = hashVisitorSessionToken(token);

  const { error } = await client.rpc("website_chat_capture_lead", {
    p_widget_id: widgetId,
    p_session_hash: sessionHash,
    p_contact_name: contact.contact_name,
    p_phone: contact.phone,
    p_email: contact.email,
  });

  if (error) throw new Error("Chat unavailable");
  return getWebsiteChatHistory(widgetId, token);
}
