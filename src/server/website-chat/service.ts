import "server-only";

import { withWebsiteChatCapability, type WebsiteChatCapabilityDb } from "./capability";
import { hashVisitorSessionToken } from "./session";
import { validateWebsiteChatContact } from "@/modules/website-chat/validation";
import type {
  ConversationStatus,
  MessageDirection,
  MessageSenderType,
} from "@/modules/contact-me/conversations/domain";

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
type StartRow = {
  available: boolean; widget_name: string; launcher_label: string;
  greeting_text: string; welcome_message: string; offline_message: string;
  lead_capture_enabled: boolean; accent_color: string; contact_saved: boolean;
};
type StatusRow = {
  available: boolean; contact_saved: boolean;
  conversation_status: ConversationStatus | null;
};
type HistoryRow = {
  sender_type: MessageSenderType; direction: MessageDirection;
  body: string; created_at: string;
};

function publicSender(sender: MessageSenderType): PublicWebsiteChatMessage["sender"] {
  if (sender === "customer") return "visitor";
  if (sender === "staff") return "team";
  return sender;
}
async function history(db: WebsiteChatCapabilityDb, widgetId: string, sessionHash: string) {
  const result = await db.query<HistoryRow>(
    "select * from public.website_chat_history($1,$2)",
    [widgetId, sessionHash],
  );
  return result.rows.map((message) => ({
    sender: publicSender(message.sender_type),
    direction: message.direction === "internal" ? "outbound" as const : message.direction,
    body: message.body,
    created_at: message.created_at,
  }));
}
export async function startWebsiteChat(widgetId: string, token: string): Promise<PublicWebsiteChatState> {
  const sessionHash=hashVisitorSessionToken(token);
  return withWebsiteChatCapability(async(db)=>{
    const row=(await db.query<StartRow>("select * from public.website_chat_start($1,$2)",[widgetId,sessionHash])).rows[0];
    if(!row) throw new Error("Chat unavailable");
    const config:PublicWebsiteChatConfig={
      available:row.available,widgetName:row.widget_name,launcherLabel:row.launcher_label,
      greetingText:row.greeting_text,welcomeMessage:row.welcome_message,
      offlineMessage:row.offline_message,leadCaptureEnabled:row.lead_capture_enabled,
      accentColor:row.accent_color,
    };
    if(!row.available) return {config,messages:[],contactSaved:false,status:null};
    return {config,messages:await history(db,widgetId,sessionHash),contactSaved:row.contact_saved,status:null};
  });
}
export async function getWebsiteChatHistory(widgetId:string,token:string):Promise<PublicWebsiteChatState>{
  const sessionHash=hashVisitorSessionToken(token);
  return withWebsiteChatCapability(async(db)=>{
    const row=(await db.query<StatusRow>("select * from public.website_chat_status($1,$2)",[widgetId,sessionHash])).rows[0];
    if(!row) throw new Error("Chat unavailable");
    return {messages:await history(db,widgetId,sessionHash),contactSaved:row.contact_saved,status:row.conversation_status};
  });
}
export async function sendWebsiteChatMessage(widgetId:string,token:string,requestId:string,body:string){
  const sessionHash=hashVisitorSessionToken(token);
  return withWebsiteChatCapability(async(db)=>{
    await db.query("select public.website_chat_send($1,$2,$3,$4)",[widgetId,sessionHash,requestId,body]);
    const row=(await db.query<StatusRow>("select * from public.website_chat_status($1,$2)",[widgetId,sessionHash])).rows[0];
    if(!row) throw new Error("Chat unavailable");
    return {messages:await history(db,widgetId,sessionHash),contactSaved:row.contact_saved,status:row.conversation_status};
  });
}
export async function captureWebsiteChatLead(
  widgetId:string,token:string,input:{contact_name:string;phone:string;email:string},
){
  const contact=validateWebsiteChatContact(input);
  const sessionHash=hashVisitorSessionToken(token);
  return withWebsiteChatCapability(async(db)=>{
    await db.query("select public.website_chat_capture_lead($1,$2,$3,$4,$5)",[
      widgetId,sessionHash,contact.contact_name,contact.phone,contact.email,
    ]);
    const row=(await db.query<StatusRow>("select * from public.website_chat_status($1,$2)",[widgetId,sessionHash])).rows[0];
    if(!row) throw new Error("Chat unavailable");
    return {messages:await history(db,widgetId,sessionHash),contactSaved:row.contact_saved,status:row.conversation_status};
  });
}
