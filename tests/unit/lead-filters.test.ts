import { describe, expect, it } from "vitest";
import { buildLeadSearchOr, hasLeadFilters } from "../../src/modules/buy-from-me/leads/filters";
import { leadFilterSchema } from "../../src/modules/buy-from-me/leads/validation";

describe("Lead search and filters", () => {
  it("parses shareable URL filters", () => {
    expect(leadFilterSchema.parse({
      q: "boiler",
      status: "qualified",
      source: "google",
      service_id: "30000000-0000-4000-8000-000000000001",
    })).toEqual({
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
      q: null,
      status: null,
      source: null,
      service_id: null,
    });
  });

  it("uses only the supported searchable Lead columns", () => {
    expect(buildLeadSearchOr("Sarah")).toBe(
      "contact_name.ilike.%Sarah%,phone.ilike.%Sarah%,email.ilike.%Sarah%,enquiry_summary.ilike.%Sarah%",
    );
  });

  it("neutralizes PostgREST filter punctuation in search input", () => {
    expect(buildLeadSearchOr("a,b%(test)")).toBe(
      "contact_name.ilike.%a b test%,phone.ilike.%a b test%,email.ilike.%a b test%,enquiry_summary.ilike.%a b test%",
    );
  });

  it("reports whether a filtered inbox is active", () => {
    expect(hasLeadFilters({ q: null, status: null, source: null, service_id: null })).toBe(false);
    expect(hasLeadFilters({ q: "phone", status: null, source: null, service_id: null })).toBe(true);
  });
});
