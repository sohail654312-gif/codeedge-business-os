import { beforeAll, describe, expect, it } from "vitest";

type Parity = { expectedCount: number; appliedCount: number; missing: string[]; unexpected: string[]; duplicates: string[] };
let migrationParity: (files: string[], names: string[]) => Parity;
beforeAll(async () => {
  const script = new URL("../../scripts/check-hosted-migration-parity.mjs", import.meta.url).href;
  ({ migrationParity } = await import(/* @vite-ignore */ script));
});

describe("Hosted migration identity comparison", () => {
  const expected = ["20260924000100_tenant_leads.sql", "20261005041205_final_crm_directory_pagination.sql"];
  it("accepts CLI suffix and legacy dashboard timestamp names without changing ledger rows", () => {
    expect(migrationParity(expected, ["tenant_leads", "20261005041205_final_crm_directory_pagination"]))
      .toEqual({ expectedCount: 2, appliedCount: 2, missing: [], unexpected: [], duplicates: [] });
  });
  it("reports missing and unexpected migration identities", () => {
    const result = migrationParity(expected, ["tenant_leads", "20261005000000_unreviewed"]);
    expect(result.missing).toEqual(["final_crm_directory_pagination"]);
    expect(result.unexpected).toEqual(["unreviewed"]);
  });
  it("rejects duplicate identities even when all expected names are present", () => {
    const result = migrationParity(expected, ["tenant_leads", "20260924000100_tenant_leads", "final_crm_directory_pagination"]);
    expect(result.duplicates).toEqual(["tenant_leads"]);
    expect(result.appliedCount).toBe(3);
  });
});
