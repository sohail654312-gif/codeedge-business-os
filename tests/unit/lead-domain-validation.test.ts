import { describe, expect, it } from "vitest";
import {
  leadCreateFormSchema,
  leadEditFormSchema,
  leadInputSchema,
  leadNoteDeleteSchema,
  leadNoteFormSchema,
  leadNoteInputSchema,
  leadStatusFormSchema,
  quoteRequestInputSchema,
} from "../../src/modules/buy-from-me/leads/validation";
import { leadSources, leadStatuses } from "../../src/modules/buy-from-me/leads/domain";

const validLead = {
  contact_name: "Alex Example",
  phone: "020 7946 0000",
  email: "",
  source: "manual",
  service_id: "",
  enquiry_summary: "Needs an estimate.",
  status: "new",
  estimated_value_pence: 48_000,
  last_contact_at: "2026-09-24T10:00:00+00:00",
};

describe("Business OS lead validation", () => {
  it("accepts a phone-based lead and normalises optional fields", () => {
    expect(leadInputSchema.parse(validLead)).toMatchObject({
      contact_name: "Alex Example",
      service_id: null,
      status: "new",
      estimated_value_pence: 48_000,
    });
  });

  it("accepts an email-based lead across supported sources and statuses", () => {
    for (const source of leadSources) {
      for (const status of leadStatuses) {
        expect(leadInputSchema.safeParse({
          ...validLead,
          phone: "",
          email: "alex@example.test",
          source,
          status,
        }).success).toBe(true);
      }
    }
  });

  it.each([
    ["contact_name", ""],
    ["contact_name", "x".repeat(121)],
    ["phone", "x".repeat(41)],
    ["email", "invalid"],
    ["email", "x".repeat(255)],
    ["source", "erpnext"],
    ["service_id", "not-a-uuid"],
    ["enquiry_summary", " "],
    ["enquiry_summary", "x".repeat(3001)],
    ["status", "quote_sent"],
    ["estimated_value_pence", -1],
    ["estimated_value_pence", 1_000_000_001],
    ["last_contact_at", "yesterday"],
  ])("rejects invalid %s", (key, value) => {
    expect(leadInputSchema.safeParse({ ...validLead, [key]: value }).success).toBe(false);
  });

  it("requires at least a phone number or email address", () => {
    expect(leadInputSchema.safeParse({ ...validLead, phone: "", email: "" }).success).toBe(false);
  });

  it("normalises create-form pounds to integer pence", () => {
    expect(leadCreateFormSchema.parse({
      contact_name: "Alex Example",
      phone: "020 7946 0000",
      email: "",
      source: "manual",
      service_id: "",
      enquiry_summary: "Needs an estimate.",
      estimated_value_gbp: "480.25",
    })).toMatchObject({
      service_id: null,
      estimated_value_pence: 48025,
    });
  });

  it("requires contact details in the real create form", () => {
    expect(leadCreateFormSchema.safeParse({
      contact_name: "Alex Example",
      phone: "",
      email: "",
      source: "manual",
      service_id: "",
      enquiry_summary: "Needs an estimate.",
      estimated_value_gbp: "",
    }).success).toBe(false);
  });

  it("validates Edit Lead identity and normalises editable fields", () => {
    expect(leadEditFormSchema.parse({
      lead_id: "40000000-0000-4000-8000-000000000001",
      contact_name: "Alex Updated",
      phone: "",
      email: "alex@example.test",
      source: "referral",
      service_id: "",
      enquiry_summary: "Updated enquiry.",
      estimated_value_gbp: "1250.50",
    })).toEqual({
      lead_id: "40000000-0000-4000-8000-000000000001",
      contact_name: "Alex Updated",
      phone: "",
      email: "alex@example.test",
      source: "referral",
      service_id: null,
      enquiry_summary: "Updated enquiry.",
      estimated_value_pence: 125050,
    });
  });

  it("rejects an invalid Lead id in the Edit Lead form", () => {
    expect(leadEditFormSchema.safeParse({
      lead_id: "not-a-uuid",
      contact_name: "Alex Example",
      phone: "020 7946 0000",
      email: "",
      source: "manual",
      service_id: "",
      enquiry_summary: "Needs an estimate.",
      estimated_value_gbp: "",
    }).success).toBe(false);
  });

  it("validates the dedicated Lead status workflow", () => {
    for (const status of leadStatuses) {
      expect(leadStatusFormSchema.safeParse({
        lead_id: "40000000-0000-4000-8000-000000000001",
        status,
      }).success).toBe(true);
    }

    expect(leadStatusFormSchema.safeParse({
      lead_id: "40000000-0000-4000-8000-000000000001",
      status: "quote_sent",
    }).success).toBe(false);

    expect(leadStatusFormSchema.safeParse({
      lead_id: "not-a-uuid",
      status: "qualified",
    }).success).toBe(false);
  });

  it("keeps quote-sent out of the lead lifecycle", () => {
    expect(leadStatuses).not.toContain("quote_sent");
  });

  it("validates tenant-safe internal note action identifiers", () => {
    expect(leadNoteFormSchema.parse({
      lead_id: "40000000-0000-4000-8000-000000000001",
      body: " Follow up tomorrow. ",
    })).toEqual({
      lead_id: "40000000-0000-4000-8000-000000000001",
      body: "Follow up tomorrow.",
    });

    expect(leadNoteDeleteSchema.safeParse({
      lead_id: "40000000-0000-4000-8000-000000000001",
      note_id: "50000000-0000-4000-8000-000000000001",
    }).success).toBe(true);

    expect(leadNoteFormSchema.safeParse({
      lead_id: "not-a-uuid",
      body: "Valid note",
    }).success).toBe(false);
  });

  it("validates future internal notes and quote requests with the MVP limits", () => {
    expect(leadNoteInputSchema.parse({ body: " Follow up tomorrow. " })).toEqual({ body: "Follow up tomorrow." });
    expect(quoteRequestInputSchema.parse({ details: " Prepare an itemised estimate. ", status: "requested" }))
      .toEqual({ details: "Prepare an itemised estimate.", status: "requested" });
  });
});
