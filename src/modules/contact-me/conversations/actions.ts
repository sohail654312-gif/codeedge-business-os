"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardTenant } from "@/server/auth/session";
import { sendEmailReply } from "@/server/channels/email";
import { sendSmsReply } from "@/server/channels/sms";
import { sendWhatsAppReply } from "@/server/channels/whatsapp";
import {
  conversationStatusFormSchema,
  localMessageFormSchema,
  startLeadConversationSchema,
} from "./validation";

export type ConversationActionState = {
  error?: string;
  success?: string;
};

function revalidateConversationPaths(conversationId?: string, leadId?: string) {
  revalidatePath("/dashboard/contact-me");
  if (conversationId) revalidatePath(`/dashboard/contact-me/${conversationId}`);
  if (leadId) revalidatePath(`/dashboard/buy-from-me/leads/${leadId}`);
}

export async function startLeadConversation(
  _state: ConversationActionState,
  formData: FormData,
): Promise<ConversationActionState> {
  const parsed = startLeadConversationSchema.safeParse({
    lead_id: formData.get("lead_id"),
    subject: formData.get("subject"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the conversation details." };
  }

  const { client, context } = await requireDashboardTenant();

  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("id,contact_name")
    .eq("business_id", context.business.id)
    .eq("id", parsed.data.lead_id)
    .maybeSingle();

  if (leadError || !lead) {
    return { error: "Lead unavailable in this workspace." };
  }

  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("id")
    .eq("business_id", context.business.id)
    .eq("source_lead_id", lead.id)
    .maybeSingle();

  if (customerError) {
    return { error: "Unable to resolve the linked Customer." };
  }

  const { data: conversation, error } = await client
    .from("conversations")
    .insert({
      business_id: context.business.id,
      lead_id: lead.id,
      customer_id: customer?.id ?? null,
      channel: "internal",
      status: "open",
      subject: parsed.data.subject || `Conversation with ${lead.contact_name}`,
      created_by: context.userId,
    })
    .select("id")
    .single();

  if (error || !conversation) {
    return { error: "Unable to start the conversation. Please try again." };
  }

  revalidateConversationPaths(conversation.id, lead.id);
  redirect(`/dashboard/contact-me/${conversation.id}`);
}

export async function addConversationMessage(
  _state: ConversationActionState,
  formData: FormData,
): Promise<ConversationActionState> {
  const parsed = localMessageFormSchema.safeParse({
    conversation_id: formData.get("conversation_id"),
    message_kind: formData.get("message_kind"),
    body: formData.get("body"),
    request_id: formData.get("request_id"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the message." };
  }

  const { client, context } = await requireDashboardTenant();

  const { data: conversation, error: conversationError } = await client
    .from("conversations")
    .select("id,lead_id,channel")
    .eq("business_id", context.business.id)
    .eq("id", parsed.data.conversation_id)
    .maybeSingle();

  if (conversationError || !conversation) {
    return { error: "Conversation unavailable in this workspace." };
  }

  if (parsed.data.message_kind === "reply" && conversation.channel === "whatsapp") {
    try {
      await sendWhatsAppReply({
        businessId: context.business.id,
        conversationId: conversation.id,
        userId: context.userId,
        requestId: parsed.data.request_id ?? randomUUID(),
        body: parsed.data.body,
      });
    } catch {
      return { error: "Unable to send the WhatsApp reply. Check the channel connection and try again." };
    }

    revalidateConversationPaths(conversation.id, conversation.lead_id ?? undefined);
    return redirect(`/dashboard/contact-me/${conversation.id}`);
  }

  if (parsed.data.message_kind === "reply" && conversation.channel === "email") {
    try {
      await sendEmailReply({
        businessId: context.business.id,
        conversationId: conversation.id,
        userId: context.userId,
        requestId: parsed.data.request_id ?? randomUUID(),
        body: parsed.data.body,
      });
    } catch {
      return { error: "Unable to send the Email reply. Check the channel connection and try again." };
    }

    revalidateConversationPaths(conversation.id, conversation.lead_id ?? undefined);
    return redirect(`/dashboard/contact-me/${conversation.id}`);
  }

  if (parsed.data.message_kind === "reply" && conversation.channel === "sms") {
    try {
      await sendSmsReply({
        businessId: context.business.id,
        conversationId: conversation.id,
        userId: context.userId,
        requestId: parsed.data.request_id ?? randomUUID(),
        body: parsed.data.body,
      });
    } catch {
      return { error: "Unable to send the SMS reply. Check the channel connection and try again." };
    }

    revalidateConversationPaths(conversation.id, conversation.lead_id ?? undefined);
    return redirect(`/dashboard/contact-me/${conversation.id}`);
  }

  const { error } = await client
    .from("messages")
    .insert({
      business_id: context.business.id,
      conversation_id: conversation.id,
      sender_type: "staff",
      sender_user_id: context.userId,
      direction: parsed.data.message_kind === "internal" ? "internal" : "outbound",
      body: parsed.data.body,
    });

  if (error) {
    return { error: "Unable to store the message. Please try again." };
  }

  revalidateConversationPaths(conversation.id, conversation.lead_id ?? undefined);
  redirect(`/dashboard/contact-me/${conversation.id}`);
}

export async function updateConversationStatus(
  _state: ConversationActionState,
  formData: FormData,
): Promise<ConversationActionState> {
  const parsed = conversationStatusFormSchema.safeParse({
    conversation_id: formData.get("conversation_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "Select a valid conversation status." };
  }

  const { client, context } = await requireDashboardTenant();

  const { data: conversation, error } = await client
    .from("conversations")
    .update({ status: parsed.data.status })
    .eq("business_id", context.business.id)
    .eq("id", parsed.data.conversation_id)
    .select("id,lead_id")
    .maybeSingle();

  if (error || !conversation) {
    return { error: "Conversation unavailable in this workspace." };
  }

  revalidateConversationPaths(conversation.id, conversation.lead_id ?? undefined);
  return { success: "Conversation status updated." };
}
