import "server-only";

export type CommunicationProviderId = "meta_whatsapp_cloud";

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

export class ProviderDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("External provider delivery failed.");
    this.name = "ProviderDeliveryError";
    this.code = code;
  }
}
