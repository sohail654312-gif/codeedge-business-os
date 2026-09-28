import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type FinanceExecutionRow =
  Database["public"]["Tables"]["finance_execution_records"]["Row"];

export type AmbiguousFinanceExecution = Pick<
  FinanceExecutionRow,
  | "id"
  | "engine"
  | "operation"
  | "document_type"
  | "codeedge_reference"
  | "external_reference"
  | "request_id"
  | "error_code"
  | "created_at"
  | "completed_at"
>;

export async function listAmbiguousFinanceExecutions(
  client: SupabaseClient<Database>,
  businessId: string,
): Promise<AmbiguousFinanceExecution[]> {
  const { data, error } = await client
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
  return data ?? [];
}

export function formatFinanceExecutionTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
