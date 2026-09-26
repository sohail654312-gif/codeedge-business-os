import "server-only";

export const businessOsE2EFixtures = {
  ownerA: "10000000-0000-4000-8000-00000000e601",
  ownerB: "10000000-0000-4000-8000-00000000e602",
  businessA: "20000000-0000-4000-8000-00000000e601",
  businessB: "20000000-0000-4000-8000-00000000e602",
  serviceA: "30000000-0000-4000-8000-00000000e601",
} as const;

type BusinessState = {
  leads: string[];
  customers: string[];
  bookings: string[];
  communications: string[];
  automationRuns: Array<{ status: "simulated"; externalEffect: boolean }>;
  voiceCalls: string[];
  moneyDocuments: string[];
  receivables: string;
  externalProviderEffects: number;
};

type HarnessState = {
  businesses: Record<string, BusinessState>;
  securityChecks: Record<string, string>;
};

declare global {
  var __codeedgeBusinessOSE2EState: HarnessState | undefined;
}

function emptyBusiness(): BusinessState {
  return {
    leads: [],
    customers: [],
    bookings: [],
    communications: [],
    automationRuns: [],
    voiceCalls: [],
    moneyDocuments: [],
    receivables: "0.00",
    externalProviderEffects: 0,
  };
}

function freshState(): HarnessState {
  return {
    businesses: {
      [businessOsE2EFixtures.businessA]: emptyBusiness(),
      [businessOsE2EFixtures.businessB]: emptyBusiness(),
    },
    securityChecks: {},
  };
}

export function requireBusinessOsE2EHarness() {
  if (process.env.CODEEDGE_E2E_HARNESS !== "1") {
    throw new Error("e2e_harness_disabled");
  }
}

export function resetBusinessOsE2EState() {
  requireBusinessOsE2EHarness();
  globalThis.__codeedgeBusinessOSE2EState = freshState();
}

function state() {
  requireBusinessOsE2EHarness();
  globalThis.__codeedgeBusinessOSE2EState ??= freshState();
  return globalThis.__codeedgeBusinessOSE2EState;
}

export function membershipFor(userId: string, businessId: string) {
  return (
    (userId === businessOsE2EFixtures.ownerA
      && businessId === businessOsE2EFixtures.businessA)
    || (userId === businessOsE2EFixtures.ownerB
      && businessId === businessOsE2EFixtures.businessB)
  ) ? "owner" as const : null;
}

function tenantState(businessId: string) {
  const tenant = state().businesses[businessId];
  if (!tenant) throw new Error("e2e_tenant_unavailable");
  return tenant;
}

export const businessOsE2EPersistence = {
  createLead(businessId: string) {
    const tenant = tenantState(businessId);
    const id = `lead-${tenant.leads.length + 1}`;
    tenant.leads.push(id);
    return id;
  },

  convertLead(businessId: string, leadId: string) {
    const tenant = tenantState(businessId);
    if (!tenant.leads.includes(leadId)) throw new Error("e2e_lead_unavailable");
    const id = `customer-${tenant.customers.length + 1}`;
    tenant.customers.push(id);
    return id;
  },

  createBooking(businessId: string, source = "owner") {
    const tenant = tenantState(businessId);
    const id = `booking-${source}-${tenant.bookings.length + 1}`;
    tenant.bookings.push(id);
    return id;
  },

  recordCommunication(businessId: string, body: string) {
    tenantState(businessId).communications.push(body);
  },

  recordAutomationDryRun(
    businessId: string,
    externalEffect: boolean,
  ) {
    tenantState(businessId).automationRuns.push({
      status: "simulated",
      externalEffect,
    });
  },

  recordVoiceCall(businessId: string, providerCallId: string) {
    tenantState(businessId).voiceCalls.push(providerCallId);
  },

  setMoneyJourney(
    businessId: string,
    documents: string[],
    receivables: string,
  ) {
    const tenant = tenantState(businessId);
    tenant.moneyDocuments = [...documents];
    tenant.receivables = receivables;
  },

  recordSecurityCheck(userId: string, result: string) {
    state().securityChecks[userId] = result;
  },
};

export function businessOsE2ESnapshot(userId: string) {
  const current = state();
  const primary = current.businesses[businessOsE2EFixtures.businessA];
  const other = current.businesses[businessOsE2EFixtures.businessB];

  return {
    leadCount: primary.leads.length,
    customerCount: primary.customers.length,
    bookingCount: primary.bookings.length,
    communicationCount: primary.communications.length,
    automationRunCount: primary.automationRuns.length,
    automationStatus: primary.automationRuns.at(-1)?.status ?? "none",
    voiceCallCount: primary.voiceCalls.length,
    lastVoiceCallId: primary.voiceCalls.at(-1) ?? "",
    moneyDocumentCount: primary.moneyDocuments.length,
    receivables: primary.receivables,
    externalProviderEffects: primary.externalProviderEffects,
    otherBusinessLeadCount: other.leads.length,
    securityResult: current.securityChecks[userId] ?? "not-run",
  };
}
