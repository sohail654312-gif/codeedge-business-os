import "server-only";

export type CommunicationProviderId = "meta_whatsapp_cloud" | "resend_email";

export type SendTextInput = {
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

export type SendEmailInput = {
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
  getReceivedEmail(input: {
    credentialKey: string;
    providerMessageId: string;
  }): Promise<ReceivedEmail>;
}

export class ProviderDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("External provider delivery failed.");
    this.name = "ProviderDeliveryError";
    this.code = code;
  }
}
