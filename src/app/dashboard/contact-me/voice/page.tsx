import Link from "next/link";
import { DemoReceptionistForm } from "@/components/voice/DemoReceptionistForm";
import { VoiceSettingsForm } from "@/components/voice/VoiceSettingsForm";
import {
  getBookingAvailability,
  listBookingServices,
} from "@/modules/booking/data";
import { localDateFromInstant } from "@/modules/booking/timezone";
import { requireDashboardTenant } from "@/server/auth/session";

export default async function VoiceReceptionistPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; date?: string }>;
}) {
  const query = await searchParams;
  const { client, context } = await requireDashboardTenant();
  const [services, settingsResult] = await Promise.all([
    listBookingServices(client, context.business.id),
    client
      .from("voice_receptionist_settings")
      .select("*")
      .eq("business_id", context.business.id)
      .maybeSingle(),
  ]);
  if (settingsResult.error) throw new Error("Unable to load AI Voice settings.");
  const settings = settingsResult.data ?? {
    business_id: context.business.id,
    enabled: false,
    greeting: "Hello, how can I help you today?",
    provider: "demo_voice",
    voice: "",
    preferred_language: "en",
    allowed_tools: [
      "business_knowledge",
      "appointment_availability",
      "get_appointment",
      "create_appointment",
      "reschedule_appointment",
      "cancel_appointment",
      "human_handoff",
    ],
    handoff_behavior: "shared_inbox" as const,
    additional_instructions: "",
    created_at: "",
    updated_at: "",
  };
  const service = services.find((item) => item.id === query.service) ?? services[0] ?? null;
  const today = localDateFromInstant(new Date(), context.business.timezone);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date! : today;

  let slots: string[] = [];
  if (service) {
    try {
      slots = (await getBookingAvailability({
        client,
        businessId: context.business.id,
        businessTimeZone: context.business.timezone,
        date,
        serviceId: service.id,
      })).slots;
    } catch {
      slots = [];
    }
  }

  return (
    <>
      <Link className="backLink" href="/dashboard/contact-me">← Back to Shared Inbox</Link>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Contact Me</div>
          <h1>AI Voice Receptionist</h1>
          <p className="muted">
            Codeedge-owned receptionist tools with provider-neutral Voice adapters.
          </p>
        </div>
        <span className="pill">{context.business.execution_mode} workspace</span>
      </div>

      <VoiceSettingsForm settings={settings} role={context.role} />
      <div className="topGap" />

      {context.business.execution_mode !== "demo" ? (
        <section className="panel">
          <h2>Demo safety</h2>
          <p className="muted">
            The built-in simulator is intentionally available only in a Demo workspace.
            Production Voice requires an approved provider connection and server credentials.
          </p>
        </section>
      ) : !service ? (
        <section className="panel">
          <h2>Demo setup required</h2>
          <p className="muted">Create at least one active Service before running the receptionist demo.</p>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>Choose test availability</h2>
            <form method="get" className="bookingDateJump">
              <div className="field">
                <label htmlFor="voice-service">Service</label>
                <select id="voice-service" name="service" defaultValue={service.id}>
                  {services.map((item) => (
                    <option value={item.id} key={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="voice-date">Date</label>
                <input id="voice-date" type="date" name="date" defaultValue={date} required />
              </div>
              <button className="btn" type="submit">Check slots</button>
            </form>
          </section>
          <div className="topGap">
            <DemoReceptionistForm
              serviceId={service.id}
              serviceName={service.name}
              slots={slots}
              timeZone={context.business.timezone}
            />
          </div>
        </>
      )}
    </>
  );
}
