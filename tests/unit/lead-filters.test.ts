import { describe, expect, it } from "vitest";
import {
  buildLeadSearchOr,
  hasLeadFilters,
  parseLeadFilters,
} from "../../src/modules/buy-from-me/leads/filters";

describe("Lead search and filters", () => {
  it("parses shareable URL filters", () => {
    expect(parseLeadFilters({
      q: "boiler",
      status: "qualified",
      source: "google",
      service: "30000000-0000-4000-8000-000000000001",
    })).toEqual({
      q: "boiler",
      status: "qualified",
      source: "google",
      service: "30000000-0000-4000-8000-000000000001",
    });
  });

  it("fails closed to no filters when URL values are invalid", () => {
    expect(parseLeadFilters({
      q: "x".repeat(101),
      status: "admin",
      source: "erpnext",
      service: "not-a-uuid",
    })).toEqual({
      q: "",
      status: null,
      source: null,
      service: null,
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
    expect(hasLeadFilters({ q: "", status: null, source: null, service: null })).toBe(false);
    expect(hasLeadFilters({ q: "phone", status: null, source: null, service: null })).toBe(true);
  });
});
