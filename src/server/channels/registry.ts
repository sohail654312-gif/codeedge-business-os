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

export type ExternalCommunicationChannel = "whatsapp" | "email" | "sms";
export type ProviderEnvironment = "sandbox" | "production";

type ProviderRegistration = {
  id: CommunicationProviderId;
  channel: ExternalCommunicationChannel;
  environments: readonly ProviderEnvironment[];
};

export const communicationProviderRegistry = {
  whatsapp: {
    meta_whatsapp_cloud: {
      id: "meta_whatsapp_cloud",
      channel: "whatsapp",
      environments: ["production"],
    },
  },
  email: {
    resend_email: {
      id: "resend_email",
      channel: "email",
      environments: ["production"],
    },
  },
  sms: {
    twilio_sms: {
      id: "twilio_sms",
      channel: "sms",
      environments: ["production"],
    },
  },
} as const;

export function getCommunicationProviderRegistration(
  channel: ExternalCommunicationChannel,
  provider: string,
): ProviderRegistration {
  if (channel === "whatsapp" && provider === "meta_whatsapp_cloud") {
    return communicationProviderRegistry.whatsapp.meta_whatsapp_cloud;
  }
  if (channel === "email" && provider === "resend_email") {
    return communicationProviderRegistry.email.resend_email;
  }
  if (channel === "sms" && provider === "twilio_sms") {
    return communicationProviderRegistry.sms.twilio_sms;
  }
  throw new Error("Unsupported communication provider.");
}

export function getTextCommunicationProvider(
  provider: string,
): TextCommunicationProvider {
  getCommunicationProviderRegistration("whatsapp", provider);
  return createMetaWhatsAppProvider();
}

export function getEmailCommunicationProvider(
  provider: string,
): EmailCommunicationProvider {
  getCommunicationProviderRegistration("email", provider);
  return createResendEmailProvider();
}

export function getSmsCommunicationProvider(
  provider: string,
): SmsCommunicationProvider {
  getCommunicationProviderRegistration("sms", provider);
  return createTwilioSmsProvider();
}
