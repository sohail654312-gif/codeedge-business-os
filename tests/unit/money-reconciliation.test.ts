import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  listAmbiguousFinanceExecutions,
} from "@/modules/money/reconciliation";

describe("Finance reconciliation queue", () => {
  it("is tenant-scoped, ambiguous-only, ordered, and bounded", async () => {
    const row = {
      id: "10000000-0000-4000-8000-000000000001",
      engine: "erpnext",
      operation: "finance.invoice.create",
      document_type: "invoice",
      codeedge_reference: "crm-1",
      external_reference: "",
      request_id: "20000000-0000-4000-8000-000000000001",
      error_code: "erpnext_outcome_ambiguous",
      created_at: "2026-09-28T00:00:00Z",
      completed_at: "2026-09-28T00:00:05Z",
    };

    const limit = vi.fn(async () => ({ data: [row], error: null }));
    const order = vi.fn(() => ({ order, limit }));
    const eqStatus = vi.fn(() => ({ order }));
    const eqBusiness = vi.fn(() => ({ eq: eqStatus }));
    const select = vi.fn(() => ({ eq: eqBusiness }));
    const from = vi.fn(() => ({ select }));

    const client = { from } as unknown as SupabaseClient<Database>;

    await expect(
      listAmbiguousFinanceExecutions(
        client,
        "30000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toEqual([row]);

    expect(from).toHaveBeenCalledWith("finance_execution_records");
    expect(eqBusiness).toHaveBeenCalledWith(
      "business_id",
      "30000000-0000-4000-8000-000000000001",
    );
    expect(eqStatus).toHaveBeenCalledWith("status", "ambiguous");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(order).toHaveBeenCalledWith("id", { ascending: false });
    expect(limit).toHaveBeenCalledWith(50);
  });
});
