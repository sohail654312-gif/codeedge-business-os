import { describe, expect, it } from "vitest";
import { demoLeads, formatLeadValue, getDemoLead } from "../../src/modules/buy-from-me/leads/demo";
import { leadSources, leadStatuses } from "../../src/modules/buy-from-me/leads/domain";

describe("lead detail demo source", () => {
  it("provides stable unique lead identifiers for detail routing", () => {
    expect(new Set(demoLeads.map((lead) => lead.id)).size).toBe(demoLeads.length);
    expect(demoLeads.every((lead) => /^[0-9a-f-]{36}$/.test(lead.id))).toBe(true);
  });

  it("uses only canonical lead statuses and sources", () => {
    for (const lead of demoLeads) {
      expect(leadStatuses).toContain(lead.status);
      expect(leadSources).toContain(lead.source);
    }
  });

  it("resolves a lead by id and fails closed for an unknown id", () => {
    expect(getDemoLead(demoLeads[0]!.id)?.contactName).toBe("Sarah Jenkins");
    expect(getDemoLead("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("formats estimated values for the UK-facing demo", () => {
    expect(formatLeadValue(48_000)).toBe("£480");
  });
});
