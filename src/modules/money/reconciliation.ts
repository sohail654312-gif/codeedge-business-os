import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";

const ambiguousFinanceExecutionSchema = z.object({
  id: z.string().uuid(),
  engine: z.string().min(1),
  operation: z.string().min(1),
  document_type: z.string(),
  codeedge_reference: z.string(),
  external_reference: z.string(),
  request_id: z.string().uuid(),
  error_code: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

export type AmbiguousFinanceExecution =
  z.infer<typeof ambiguousFinanceExecutionSchema>;

type ReconciliationQuery = {
  select(columns: string): ReconciliationQuery;
  eq(column: string, value: string): ReconciliationQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): ReconciliationQuery;
  limit(count: number): Promise<{ data: unknown; error: unknown }>;
};

type ReconciliationClient = {
  from(relation: string): ReconciliationQuery;
};

export async function listAmbiguousFinanceExecutions(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<AmbiguousFinanceExecution[]> {
  // finance_execution_records is intentionally absent from the normal generated
  // application table contract because Finance writes use the restricted
  // capability boundary. Authenticated users still have tenant-scoped SELECT
  // access through forced RLS for operational review, so keep this read-only
  // escape hatch local and validate every returned row.
  const reconciliationClient =
    client as unknown as ReconciliationClient;

  const { data, error } = await reconciliationClient
    .from("finance_execution_records")
    .select(
      "id,engine,operation,document_type,codeedge_reference,external_reference,request_id,error_code,created_at,completed_at",
    )
    .eq("business_id", businessId)
    .eq("status", "ambiguous")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error("Unable to load Finance reconciliation queue.");
  }

  const parsed = z.array(ambiguousFinanceExecutionSchema).safeParse(data ?? []);
  if (!parsed.success) {
    throw new Error("Finance reconciliation queue returned invalid data.");
  }
  return parsed.data;
}

export function formatFinanceExecutionTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
