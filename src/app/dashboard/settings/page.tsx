import Link from "next/link";
import { BusinessProfilePanel, ServicesPanel } from "@/components/settings/BusinessProfileServices";
import { OpeningHoursPanel, ServiceAreasPanel } from "@/components/settings/ServiceCoveragePanels";
import { BusinessSettingsPanel, FaqPanel } from "@/components/settings/FaqSettingsPanels";
import { WebsiteChatSettingsPanel } from "@/components/settings/WebsiteChatSettingsPanel";
import { WhatsAppSettingsPanel } from "@/components/settings/WhatsAppSettingsPanel";
import { EmailSettingsPanel } from "@/components/settings/EmailSettingsPanel";
import { getEnvironmentIfConfigured } from "@/server/env";
import { requireDashboardTenant } from "@/server/auth/session";
import { resendCredentialConfigured } from "@/server/channels/resend-email";

export default async function Settings() {
  const { client, context } = await requireDashboardTenant();

  const [
    profileResult,
    serviceResult,
    areaResult,
    hoursResult,
    faqResult,
    settingsResult,
    websiteChatResult,
    whatsappResult,
    emailResult,
    emailSettingsResult,
  ] = await Promise.all([
    client
      .from("business_profiles")
      .select("*")
      .eq("business_id", context.business.id)
      .maybeSingle(),
    client
      .from("services")
      .select("*")
      .eq("business_id", context.business.id)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("service_areas")
      .select("*")
      .eq("business_id", context.business.id)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("opening_hours")
      .select("*")
      .eq("business_id", context.business.id)
      .order("weekday", { ascending: true }),
    client
      .from("business_faqs")
      .select("*")
      .eq("business_id", context.business.id)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("business_settings")
      .select("*")
      .eq("business_id", context.business.id)
      .maybeSingle(),
    client
      .from("website_chat_widgets")
      .select("*")
      .eq("business_id", context.business.id)
      .maybeSingle(),
    client
      .from("channel_connections")
      .select("*")
      .eq("business_id", context.business.id)
      .eq("channel", "whatsapp")
      .eq("provider", "meta_whatsapp_cloud")
      .maybeSingle(),
    client
      .from("channel_connections")
      .select("*")
      .eq("business_id", context.business.id)
      .eq("channel", "email")
      .eq("provider", "resend_email")
      .maybeSingle(),
    client
      .from("email_channel_settings")
      .select("*")
      .eq("business_id", context.business.id)
      .maybeSingle(),
  ]);

  if (
    profileResult.error ||
    serviceResult.error ||
    areaResult.error ||
    hoursResult.error ||
    faqResult.error ||
    settingsResult.error ||
    websiteChatResult.error ||
    whatsappResult.error ||
    emailResult.error ||
    emailSettingsResult.error
  ) {
    throw new Error("Unable to load Business Information.");
  }

  const canEdit = context.role === "owner";
  const appUrl = getEnvironmentIfConfigured()?.NEXT_PUBLIC_APP_URL ?? null;
  const emailCredentialConfigured = resendCredentialConfigured(
    emailResult.data?.credential_key,
  );
  const safeEmailConnection = emailResult.data
    ? {
        ...emailResult.data,
        credential_key: canEdit ? emailResult.data.credential_key : "",
      }
    : null;

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Settings</h1>
          <p className="muted">{context.business.name}</p>
        </div>
        <span className="pill">{canEdit ? "Owner" : "Staff"}</span>
      </div>

      <div className="twoCol">
        <section className="panel">
          <h2>Workspace</h2>
          <dl className="detailList">
            <div><dt>Business</dt><dd>{context.business.name}</dd></div>
            <div><dt>Your access</dt><dd>{canEdit ? "Owner" : "Staff"}</dd></div>
            <div><dt>Time zone</dt><dd>{context.business.timezone}</dd></div>
          </dl>
        </section>

        <section className="panel">
          <h2>Integration status</h2>
          <p><b>ERPNext</b> — replaceable back-office adapter</p>
          <p className="muted">
            Messaging adapters: {[
              whatsappResult.data?.enabled ? "WhatsApp" : null,
              emailResult.data?.enabled ? "Email" : null,
            ].filter(Boolean).join(" + ") || "No external messaging channel enabled"}
          </p>
          <p className="muted">Voice adapter: Reserved for a later phase</p>
          <Link className="btn" href="/dashboard/settings/erpnext">Open ERPNext setup</Link>
        </section>
      </div>

      <BusinessProfilePanel
        key={profileResult.data?.updated_at ?? "new-profile"}
        profile={profileResult.data}
        canEdit={canEdit}
      />

      <ServicesPanel
        services={serviceResult.data ?? []}
        canEdit={canEdit}
      />

      <ServiceAreasPanel
        areas={areaResult.data ?? []}
        canEdit={canEdit}
      />

      <OpeningHoursPanel
        hours={hoursResult.data ?? []}
        timezone={context.business.timezone}
        canEdit={canEdit}
      />

      <FaqPanel
        faqs={faqResult.data ?? []}
        canEdit={canEdit}
      />

      <BusinessSettingsPanel
        key={settingsResult.data?.updated_at ?? "default-settings"}
        settings={settingsResult.data}
        canEdit={canEdit}
      />

      <WebsiteChatSettingsPanel
        key={websiteChatResult.data?.updated_at ?? "new-website-chat"}
        widget={websiteChatResult.data}
        canEdit={canEdit}
        appUrl={appUrl}
      />

      <WhatsAppSettingsPanel
        key={whatsappResult.data?.updated_at ?? "new-whatsapp"}
        connection={whatsappResult.data}
        canEdit={canEdit}
        appUrl={appUrl}
      />

      <EmailSettingsPanel
        key={emailResult.data?.updated_at ?? "new-email"}
        connection={safeEmailConnection}
        settings={emailSettingsResult.data}
        canEdit={canEdit}
        appUrl={appUrl}
        credentialConfigured={emailCredentialConfigured}
      />
    </>
  );
}
