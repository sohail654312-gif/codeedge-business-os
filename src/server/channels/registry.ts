import "server-only";

import type {
  CommunicationProviderId,
  EmailCommunicationProvider,
  SmsCommunicationProvider,
  TextCommunicationProvider,
} from "./provider";
import { createMetaWhatsAppProvider } from "./meta-whatsapp";
import { createResendEmailProvider } from "./resend-email";
import { createTwilioSmsProvider } from "./twilio-sms";

export function getTextCommunicationProvider(
  provider: string,
): TextCommunicationProvider {
  const id = provider as CommunicationProviderId;

  if (id === "meta_whatsapp_cloud") {
    return createMetaWhatsAppProvider();
  }

  throw new Error("Unsupported communication provider.");
}

export function getEmailCommunicationProvider(
  provider: string,
): EmailCommunicationProvider {
  const id = provider as CommunicationProviderId;

  if (id === "resend_email") {
    return createResendEmailProvider();
  }

  throw new Error("Unsupported Email provider.");
}

export function getSmsCommunicationProvider(
  provider: string,
): SmsCommunicationProvider {
  const id = provider as CommunicationProviderId;

  if (id === "twilio_sms") {
    return createTwilioSmsProvider();
  }

  throw new Error("Unsupported SMS provider.");
}
