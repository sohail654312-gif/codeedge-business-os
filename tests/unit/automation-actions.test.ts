import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutomationWorkflow,
  setAutomationWorkflowEnabled,
} from "@/modules/automation/actions";
import { requireDashboardTenant } from "@/server/auth/session";

vi.mock("@/server/auth/session", () => ({ requireDashboardTenant: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const businessId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const workflowId = "94000000-0000-4000-8000-000000000001";

function setup(role: "owner" | "staff" = "owner") {
  const calls: Array<{ table: string; op?: string; values?: unknown; filters: unknown[][] }> = [];
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] as unknown[][] } as { table: string; op?: string; values?: unknown; filters: unknown[][] };
    calls.push(call);
    const chain = {
      insert: vi.fn((values: unknown) => { call.op = "insert"; call.values = values; return chain; }),
      update: vi.fn((values: unknown) => { call.op = "update"; call.values = values; return chain; }),
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => { call.filters.push(args); return chain; }),
      single: vi.fn(async () => ({ data: { id: workflowId }, error: null })),
      maybeSingle: vi.fn(async () => ({ data: { id: workflowId }, error: null })),
    };
    return chain;
  });

  vi.mocked(requireDashboardTenant).mockResolvedValue({
    client: { from },
    context: {
      userId,
      role,
      business: {
        id: businessId,
        name: "Business A",
        slug: "business-a",
        status: "active",
        timezone: "Europe/London",
        execution_mode: "demo",
        created_at: "2026-09-25T00:00:00Z",
        updated_at: "2026-09-25T00:00:00Z",
      },
    },
  } as unknown as Awaited<ReturnType<typeof requireDashboardTenant>>);
  return calls;
}

function workflowForm() {
  const form = new FormData();
  form.set("name", "Qualify new leads");
  form.set("description", "V1 workflow");
  form.set("trigger_type", "lead.created");
  form.set("condition_path", "lead.status");
  form.set("condition_operator", "eq");
  form.set("condition_value", "new");
  form.set("action_type", "crm.update_lead_status");
  form.set("lead_id_path", "lead.id");
  form.set("lead_status", "contacted");
  form.set("conversation_id_path", "conversation.id");
  form.set("message_body", "");
  form.set("enabled", "on");
  return form;
}

beforeEach(() => vi.clearAllMocks());

describe("Automation V1 server actions", () => {
  it("derives tenant and creator identity on workflow creation", async () => {
    const calls = setup();
    const form = workflowForm();
    form.set("business_id", "20000000-0000-4000-8000-000000000002");

    expect(await createAutomationWorkflow({}, form)).toHaveProperty("success");
    const insert = calls.find((call) => call.op === "insert");
    expect(insert?.values).toMatchObject({
      business_id: businessId,
      created_by: userId,
      trigger_type: "lead.created",
      enabled: true,
    });
  });

  it("blocks staff workflow mutation", async () => {
    const calls = setup("staff");
    expect(await createAutomationWorkflow({}, workflowForm())).toHaveProperty("error");
    expect(calls).toEqual([]);
  });

  it("scopes enable/disable updates to the authenticated tenant", async () => {
    const calls = setup();
    const form = new FormData();
    form.set("workflow_id", workflowId);
    form.set("enabled", "false");

    expect(await setAutomationWorkflowEnabled({}, form)).toHaveProperty("success");
    const update = calls.find((call) => call.op === "update");
    expect(update?.values).toEqual({ enabled: false });
    expect(update?.filters).toEqual([["business_id", businessId], ["id", workflowId]]);
  });
});
