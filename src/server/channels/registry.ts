import "server-only";

import type { CommunicationProviderId, TextCommunicationProvider } from "./provider";
import { createMetaWhatsAppProvider } from "./meta-whatsapp";

export function getTextCommunicationProvider(
  provider: string,
): TextCommunicationProvider {
  const id = provider as CommunicationProviderId;

  if (id === "meta_whatsapp_cloud") {
    return createMetaWhatsAppProvider();
  }

  throw new Error("Unsupported communication provider.");
}
