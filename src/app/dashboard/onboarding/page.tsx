import Link from "next/link";
import { requireDashboardTenant } from "@/server/auth/session";

type Step = {
  title: string;
  detail: string;
  href: string;
  done: boolean;
};

export default async function OperationalOnboardingPage() {
  const { client, context } = await requireDashboardTenant();

  const [profile, services, hours, channels, voice, automations] = await Promise.all([
    client
      .from("business_profiles")
      .select("business_id,trading_name,phone,email")
      .eq("business_id", context.business.id)
      .maybeSingle(),
    client
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id)
      .eq("active", true),
    client
      .from("opening_hours")
      .select("weekday", { count: "exact", head: true })
      .eq("business_id", context.business.id),
    client
      .from("channel_connections")
      .select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id)
      .eq("enabled", true),
    client
      .from("voice_receptionist_settings")
      .select("enabled")
      .eq("business_id", context.business.id)
      .maybeSingle(),
    client
      .from("automation_workflows")
      .select("id", { count: "exact", head: true })
      .eq("business_id", context.business.id),
  ]);

  const profileReady = Boolean(
    profile.data
    && (profile.data.trading_name || profile.data.phone || profile.data.email),
  );

  const steps: Step[] = [
    {
      title: "Business identity and timezone",
      detail: `Confirm your profile and operating timezone. Current timezone: ${context.business.timezone}.`,
      href: "/dashboard/settings",
      done: profileReady,
    },
    {
      title: "Services and opening hours",
      detail: "Add at least one active Service and the hours Codeedge should use for Booking.",
      href: "/dashboard/settings/services",
      done: (services.count ?? 0) > 0 && (hours.count ?? 0) > 0,
    },
    {
      title: "Customer contact channels",
      detail: "Connect the channels your team will actually use. Demo workspaces can stay provider-safe.",
      href: "/dashboard/contact-me",
      done: (channels.count ?? 0) > 0,
    },
    {
      title: "AI Voice Receptionist",
      detail: "Choose the canonical receptionist settings and review the tenant-bound Voice adapter status.",
      href: "/dashboard/contact-me/voice",
      done: Boolean(voice.data?.enabled),
    },
    {
      title: "Automation",
      detail: "Create a focused workflow and confirm its run history before expanding automation.",
      href: "/dashboard/automations",
      done: (automations.count ?? 0) > 0,
    },
    {
      title: "Money",
      detail: "Review the active Finance Engine and use only the write operations it explicitly supports.",
      href: "/dashboard/money",
      done: false,
    },
  ];

  const completed = steps.filter((step) => step.done).length;

  return (
    <>
      <div className="pageHead">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1>Operational setup guide</h1>
          <p className="muted">
            A guided path from a new workspace to the core Codeedge operating flows.
          </p>
        </div>
        <span className="pill">{completed}/{steps.length} checked</span>
      </div>

      <div className="panel">
        <h2>Set up in order</h2>
        <p className="muted">
          Status is derived from this tenant&apos;s current Codeedge data. Optional areas remain visible rather than being marked complete by assumption.
        </p>
        <div className="moduleTiles">
          {steps.map((step, index) => (
            <Link className="moduleTile" href={step.href} key={step.title}>
              <b>{index + 1}. {step.title}</b>
              <span className="muted">{step.detail}</span>
              <span className="pill">{step.done ? "Ready" : "Review"}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
