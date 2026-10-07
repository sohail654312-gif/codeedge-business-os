import "server-only";

export type CommunicationProviderId = "meta_whatsapp_cloud" | "resend_email" | "twilio_sms";

export type ProviderCredentialContext = {
  businessId: string;
  providerEnvironment: "sandbox" | "production";
};

export type SendTextInput = ProviderCredentialContext & {
  externalSenderId: string;
  credentialKey: string;
  recipient: string;
  body: string;
};

export type SendTextResult = {
  providerMessageId: string;
};

export interface TextCommunicationProvider {
  readonly id: CommunicationProviderId;
  sendText(input: SendTextInput): Promise<SendTextResult>;
}

export type WhatsAppSender = ProviderCredentialContext & {
  externalSenderId: string;
  credentialKey: string;
};
export type WhatsAppTemplateInput = WhatsAppSender & {
  recipient: string;
  name: string;
  language: string;
  parameters: string[];
};
export type WhatsAppMediaInput = WhatsAppSender & {
  recipient: string;
  type: "image" | "document" | "audio" | "video";
  mediaId: string;
  caption?: string;
};
export type WhatsAppInteractiveInput = WhatsAppSender & {
  recipient: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
};
export type WhatsAppApprovedTemplate = {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  status: string;
  body: string;
};
export interface WhatsAppProvider extends TextCommunicationProvider {
  sendTemplate(input: WhatsAppTemplateInput): Promise<SendTextResult>;
  sendInteractiveMessage(input: WhatsAppInteractiveInput): Promise<SendTextResult>;
  sendMedia(input: WhatsAppMediaInput): Promise<SendTextResult>;
  markAsRead(input: WhatsAppSender & { providerMessageId: string }): Promise<void>;
  healthCheck(input: WhatsAppSender): Promise<{ connected: boolean }>;
  listTemplates(input: WhatsAppSender & { accountId: string }): Promise<WhatsAppApprovedTemplate[]>;
  downloadMedia(input: WhatsAppSender & { mediaId: string; maxBytes: number }): Promise<{ bytes: Uint8Array; mimeType: string }>;
}

export type SendEmailInput = ProviderCredentialContext & {
  credentialKey: string;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  recipient: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string[];
  idempotencyKey: string;
};

export type SendEmailResult = {
  providerMessageId: string;
  rfcMessageId: string | null;
};

export type ReceivedEmail = {
  providerMessageId: string;
  rfcMessageId: string;
  fromEmail: string;
  fromName: string;
  recipients: string[];
  replyToEmail: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string[];
  hasAttachments: boolean;
};

export interface EmailCommunicationProvider {
  readonly id: "resend_email";
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  getReceivedEmail(input: ProviderCredentialContext & {
    credentialKey: string;
    providerMessageId: string;
    externalSenderId: string;
  }): Promise<ReceivedEmail>;
}

export type SmsProviderStatus = "sending" | "queued" | "sent" | "delivered" | "failed";

export type SendSmsInput = ProviderCredentialContext & {
  externalAccountId: string;
  externalSenderId: string;
  credentialKey: string;
  recipient: string;
  body: string;
  statusCallbackUrl: string;
};

export type SendSmsResult = {
  providerMessageId: string;
  status: SmsProviderStatus;
};

export interface SmsCommunicationProvider {
  readonly id: "twilio_sms";
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
}

export class ProviderDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("External provider delivery failed.");
    this.name = "ProviderDeliveryError";
    this.code = code;
  }
}
