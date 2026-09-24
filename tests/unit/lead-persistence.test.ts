import { describe, expect, it } from "vitest";
import { buildLeadInsert, buildLeadUpdate } from "../../src/modules/buy-from-me/leads/persistence";

describe("Lead persistence payloads", () => {
  const values = {
    contact_name: "Alex Example",
    phone: "020 7946 0000",
    email: "",
    source: "manual" as const,
    service_id: null,
    enquiry_summary: "Needs an estimate.",
    estimated_value_pence: 48_000,
  };

  it("derives tenant, creator and initial status from verified server context", () => {
    expect(buildLeadInsert(values, {
      businessId: "20000000-0000-4000-8000-000000000001",
      userId: "10000000-0000-4000-8000-000000000001",
    })).toEqual({
      business_id: "20000000-0000-4000-8000-000000000001",
      contact_name: "Alex Example",
      phone: "020 7946 0000",
      email: "",
      source: "manual",
      service_id: null,
      enquiry_summary: "Needs an estimate.",
      status: "new",
      estimated_value_pence: 48_000,
      last_contact_at: null,
      created_by: "10000000-0000-4000-8000-000000000001",
    });
  });

  it("has no client-controlled ownership or initial status input", () => {
    const inputKeys = Object.keys(values);
    expect(inputKeys).not.toContain("business_id");
    expect(inputKeys).not.toContain("created_by");
    expect(inputKeys).not.toContain("status");
  });

  it("limits Edit Lead persistence to editable fields only", () => {
    const update = buildLeadUpdate({
      ...values,
      contact_name: "Alex Updated",
      source: "referral",
    });

    expect(update).toEqual({
      contact_name: "Alex Updated",
      phone: "020 7946 0000",
      email: "",
      source: "referral",
      service_id: null,
      enquiry_summary: "Needs an estimate.",
      estimated_value_pence: 48_000,
    });
    expect(update).not.toHaveProperty("business_id");
    expect(update).not.toHaveProperty("created_by");
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("last_contact_at");
  });
});
