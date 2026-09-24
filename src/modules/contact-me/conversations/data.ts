import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Conversation,
  Customer,
  Database,
  Lead,
  Message,
} from "@/types/database";
import type { InboxFilters } from "./validation";

export type InboxConversation = Conversation & {
  contact_name: string | null;
  crm_kind: "lead" | "customer" | null;
};

export type ConversationDetail = {
  conversation: Conversation;
  lead: Pick<Lead, "id" | "contact_name" | "phone" | "email"> | null;
  customer: Pick<Customer, "id" | "contact_name" | "phone" | "email"> | null;
  messages: Message[];
};

async function crmIdentityMaps(
  client: SupabaseClient<Database>,
  businessId: string,
  conversations: Conversation[],
) {
  const leadIds = [...new Set(conversations.map((item) => item.lead_id).filter((id): id is string => Boolean(id)))];
  const customerIds = [...new Set(conversations.map((item) => item.customer_id).filter((id): id is string => Boolean(id)))];

  const [leadsResult, customersResult] = await Promise.all([
    leadIds.length
      ? client.from("leads").select("id,contact_name").eq("business_id", businessId).in("id", leadIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? client.from("customers").select("id,contact_name").eq("business_id", businessId).in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (leadsResult.error || customersResult.error) {
    throw new Error("Unable to load conversation CRM identities.");
  }

  return {
    leads: new Map((leadsResult.data ?? []).map((lead) => [lead.id, lead.contact_name])),
    customers: new Map((customersResult.data ?? []).map((customer) => [customer.id, customer.contact_name])),
  };
}

export async function listInboxConversations(
  client: SupabaseClient<Database>,
  businessId: string,
  filters: InboxFilters,
): Promise<InboxConversation[]> {
  let query = client
    .from("conversations")
    .select("*")
    .eq("business_id", businessId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.channel) query = query.eq("channel", filters.channel);

  const { data, error } = await query
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);

  if (error) throw new Error("Unable to load the Shared Inbox.");

  const conversations = data ?? [];
  const identities = await crmIdentityMaps(client, businessId, conversations);

  return conversations.map((conversation) => {
    if (conversation.customer_id && identities.customers.has(conversation.customer_id)) {
      return {
        ...conversation,
        contact_name: identities.customers.get(conversation.customer_id) ?? null,
        crm_kind: "customer" as const,
      };
    }

    if (conversation.lead_id && identities.leads.has(conversation.lead_id)) {
      return {
        ...conversation,
        contact_name: identities.leads.get(conversation.lead_id) ?? null,
        crm_kind: "lead" as const,
      };
    }

    return { ...conversation, contact_name: null, crm_kind: null };
  });
}

export async function getConversationDetail(
  client: SupabaseClient<Database>,
  businessId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const { data: conversation, error } = await client
    .from("conversations")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .maybeSingle();

  if (error) throw new Error("Unable to load the conversation.");
  if (!conversation) return null;

  const [messagesResult, leadResult, customerResult] = await Promise.all([
    client
      .from("messages")
      .select("*")
      .eq("business_id", businessId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(500),
    conversation.lead_id
      ? client
        .from("leads")
        .select("id,contact_name,phone,email")
        .eq("business_id", businessId)
        .eq("id", conversation.lead_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    conversation.customer_id
      ? client
        .from("customers")
        .select("id,contact_name,phone,email")
        .eq("business_id", businessId)
        .eq("id", conversation.customer_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (messagesResult.error || leadResult.error || customerResult.error) {
    throw new Error("Unable to load conversation details.");
  }

  return {
    conversation,
    lead: leadResult.data,
    customer: customerResult.data,
    messages: messagesResult.data ?? [],
  };
}

export async function listLeadConversations(
  client: SupabaseClient<Database>,
  businessId: string,
  leadId: string,
): Promise<Conversation[]> {
  const { data, error } = await client
    .from("conversations")
    .select("*")
    .eq("business_id", businessId)
    .eq("lead_id", leadId)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(20);

  if (error) throw new Error("Unable to load Lead conversations.");
  return data ?? [];
}

export function formatConversationTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
