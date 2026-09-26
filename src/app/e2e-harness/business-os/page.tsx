import { notFound } from "next/navigation";
import {
  currentBusinessOsE2EUser,
  requireBusinessOsE2ETenant,
} from "./auth";
import {
  attemptCrossTenantE2EAction,
  automationE2EAction,
  communicationE2EAction,
  convertLeadE2EAction,
  createBookingE2EAction,
  createLeadE2EAction,
  moneyE2EAction,
  signInBusinessOsE2EAction,
  voiceE2EAction,
} from "./actions";
import {
  businessOsE2ESnapshot,
  requireBusinessOsE2EHarness,
} from "./state";

export const dynamic = "force-dynamic";

export default async function BusinessOsE2EPage() {
  try {
    requireBusinessOsE2EHarness();
  } catch {
    notFound();
  }

  const userId = await currentBusinessOsE2EUser();

  if (!userId) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Codeedge Business OS critical-path harness</h1>
        <form action={signInBusinessOsE2EAction}>
          <label>
            Email
            <input name="email" defaultValue="owner@codeedge.test" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              defaultValue="Test-only-pass!"
            />
          </label>
          <button type="submit">Sign in as owner</button>
        </form>
      </main>
    );
  }

  const context = await requireBusinessOsE2ETenant();
  const snapshot = businessOsE2ESnapshot(userId);

  return (
    <main style={{ padding: 24 }}>
      <h1>Codeedge Business OS critical-path harness</h1>
      <p data-testid="signed-in-user">owner:{context.userId}</p>
      <p data-testid="workspace">workspace:{context.businessId}</p>

      <form action={attemptCrossTenantE2EAction}>
        <button type="submit">Attempt other workspace</button>
      </form>
      <p data-testid="security-result">{snapshot.securityResult}</p>
      <p data-testid="other-business-leads">{snapshot.otherBusinessLeadCount}</p>

      <form action={createLeadE2EAction}>
        <button type="submit">Create Lead</button>
      </form>
      <p data-testid="lead-count">{snapshot.leadCount}</p>

      <form action={convertLeadE2EAction}>
        <button type="submit">Convert Lead to Customer</button>
      </form>
      <p data-testid="customer-count">{snapshot.customerCount}</p>

      <form action={createBookingE2EAction}>
        <button type="submit">Create Booking</button>
      </form>
      <p data-testid="booking-count">{snapshot.bookingCount}</p>

      <form action={communicationE2EAction}>
        <button type="submit">Send Demo Communication</button>
      </form>
      <p data-testid="communication-count">{snapshot.communicationCount}</p>

      <form action={automationE2EAction}>
        <button type="submit">Run Automation Demo Dry-Run</button>
      </form>
      <p data-testid="automation-count">{snapshot.automationRunCount}</p>
      <p data-testid="automation-status">{snapshot.automationStatus}</p>

      <form action={voiceE2EAction}>
        <button type="submit">Run Demo Receptionist</button>
      </form>
      <p data-testid="voice-count">{snapshot.voiceCallCount}</p>
      <p data-testid="voice-provider-id">{snapshot.lastVoiceCallId}</p>

      <form action={moneyE2EAction}>
        <button type="submit">Run Demo Money Journey</button>
      </form>
      <p data-testid="money-documents">{snapshot.moneyDocumentCount}</p>
      <p data-testid="receivables">{snapshot.receivables}</p>

      <p data-testid="external-provider-effects">
        {snapshot.externalProviderEffects}
      </p>
    </main>
  );
}
