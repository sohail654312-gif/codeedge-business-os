import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveVoiceReceptionistSettings } from "@/modules/voice/settings-actions";
import { runDemoReceptionist } from "@/modules/voice/demo-actions";
import { requireDashboardTenant } from "@/server/auth/session";
import { loadReceptionistKnowledge } from "@/server/voice/receptionist-tools";

vi.mock("@/server/auth/session", () => ({ requireDashboardTenant: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/voice/receptionist-tools", () => ({
  loadReceptionistKnowledge: vi.fn(),
  checkReceptionistAvailability: vi.fn(),
  createReceptionistAppointment: vi.fn(),
}));
vi.mock("@/server/voice/capability", () => ({ withVoiceCapability: vi.fn() }));

const own = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const required = ["business_knowledge", "appointment_availability", "create_appointment"];

function setup({ role = "owner", existing = null, writeRow = { business_id: own }, readError = null }: {
  role?: "owner" | "staff";
  existing?: unknown;
  writeRow?: unknown;
  readError?: unknown;
} = {}) {
  const insert = vi.fn();
  const update = vi.fn();
  const filters: unknown[][] = [];
  const from = vi.fn(() => {
    let writing = false;
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => { filters.push(args); return chain; }),
      insert: vi.fn((value: unknown) => { writing = true; insert(value); return chain; }),
      update: vi.fn((value: unknown) => { writing = true; update(value); return chain; }),
      maybeSingle: vi.fn(async () => ({ data: writing ? writeRow : existing, error: writing ? null : readError })),
      single: vi.fn(async () => ({ data: writeRow, error: null })),
    };
    return chain;
  });
  const rpc = vi.fn();
  vi.mocked(requireDashboardTenant).mockResolvedValue({
    client: { from, rpc },
    context: { userId: "10000000-0000-4000-8000-000000000001", role,
      business: { id: own, execution_mode: "demo", timezone: "Asia/Karachi" } },
  } as unknown as Awaited<ReturnType<typeof requireDashboardTenant>>);
  return { insert, update, from, filters, rpc };
}

function settingsForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ enabled: "on", greeting: "Hello", provider: "demo_voice",
    voice: "", preferred_language: "en", handoff_behavior: "shared_inbox", additional_instructions: "" })) form.set(key, value);
  for (const tool of required) form.append("allowed_tools", tool);
  form.set("business_id", other);
  return form;
}

function demoForm() {
  const form = new FormData();
  form.set("contact_name", "Test caller");
  form.set("contact_phone", "");
  form.set("service_id", "30000000-0000-4000-8000-000000000001");
  form.set("starts_at", "2030-01-07T04:00:00.000Z");
  return form;
}

beforeEach(() => vi.clearAllMocks());

describe("Voice settings owner actions", () => {
  it("creates settings with server-derived ownership", async () => {
    const calls = setup();
    expect(await saveVoiceReceptionistSettings({}, settingsForm())).toHaveProperty("success");
    expect(calls.insert).toHaveBeenCalledWith(expect.objectContaining({ business_id: own }));
    expect(calls.update).not.toHaveBeenCalled();
  });
  it("updates permitted settings without updating the protected workspace ID", async () => {
    const calls = setup({ existing: { business_id: own } });
    expect(await saveVoiceReceptionistSettings({}, settingsForm())).toHaveProperty("success");
    expect(calls.update).toHaveBeenCalledOnce();
    expect(calls.update.mock.calls[0][0]).not.toHaveProperty("business_id");
    expect(calls.filters).toEqual([["business_id", own], ["business_id", own]]);
    expect(calls.insert).not.toHaveBeenCalled();
  });
  it("rejects staff before accessing settings", async () => {
    const calls = setup({ role: "staff" });
    expect(await saveVoiceReceptionistSettings({}, settingsForm())).toHaveProperty("error");
    expect(calls.from).not.toHaveBeenCalled();
  });
  it("does not report success for an update hidden or rejected by RLS", async () => {
    setup({ existing: { business_id: own }, writeRow: null });
    expect(await saveVoiceReceptionistSettings({}, settingsForm())).toHaveProperty("error");
  });
});

describe("Demo Receptionist settings enforcement", () => {
  it.each([
    ["missing settings", null],
    ["disabled receptionist", { enabled: false, provider: "demo_voice", allowed_tools: required }],
    ["different adapter", { enabled: true, provider: "vapi", allowed_tools: required }],
    ["booking disallowed", { enabled: true, provider: "demo_voice", allowed_tools: required.slice(0, 2) }],
  ])("blocks %s before creating any call or booking", async (_label, existing) => {
    const calls = setup({ existing });
    expect(await runDemoReceptionist({}, demoForm())).toHaveProperty("error");
    expect(calls.rpc).not.toHaveBeenCalled();
    expect(loadReceptionistKnowledge).not.toHaveBeenCalled();
    expect(calls.filters).toEqual([["business_id", own]]);
  });
  it("fails closed when settings cannot be read", async () => {
    const calls = setup({ readError: { message: "unavailable" } });
    expect(await runDemoReceptionist({}, demoForm())).toHaveProperty("error");
    expect(calls.rpc).not.toHaveBeenCalled();
    expect(loadReceptionistKnowledge).not.toHaveBeenCalled();
  });
});
