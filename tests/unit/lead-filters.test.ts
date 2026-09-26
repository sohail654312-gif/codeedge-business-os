import { describe, expect, it } from "vitest";
import { hasLeadFilters } from "../../src/modules/buy-from-me/leads/filters";
import { leadFilterSchema } from "../../src/modules/buy-from-me/leads/validation";

describe("Lead search and filters", () => {
  it("parses shareable URL filters", () => {
    expect(leadFilterSchema.parse({
      q: "boiler",
      status: "qualified",
      source: "google",
      service_id: "30000000-0000-4000-8000-000000000001",
    })).toEqual({
      page: 1,
      q: "boiler",
      status: "qualified",
      source: "google",
      service_id: "30000000-0000-4000-8000-000000000001",
    });
  });

  it("drops invalid individual URL filters instead of widening tenant scope", () => {
    expect(leadFilterSchema.parse({
      q: "x".repeat(121),
      status: "admin",
      source: "erpnext",
      service_id: "not-a-uuid",
    })).toEqual({
      page: 1,
      q: null,
      status: null,
      source: null,
      service_id: null,
    });
  });

  it("reports whether a filtered inbox is active", () => {
    expect(hasLeadFilters({ page: 1, q: null, status: null, source: null, service_id: null })).toBe(false);
    expect(hasLeadFilters({ page: 1, q: "phone", status: null, source: null, service_id: null })).toBe(true);
  });
});
