import "server-only";

import type {
  CommunicationProviderId,
  EmailCommunicationProvider,
  TextCommunicationProvider,
} from "./provider";
import { createMetaWhatsAppProvider } from "./meta-whatsapp";
import { createResendEmailProvider } from "./resend-email";

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
