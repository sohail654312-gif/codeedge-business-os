import { describe, expect, it } from "vitest";
import { businessProfileSchema, serviceIdSchema, serviceSchema } from "@/modules/business-information/validation";

describe("Business Information validation", () => {
  it("accepts a safe Business Profile", () => {
    const result = businessProfileSchema.safeParse({
      trading_name: "CodeEdge Plumbing",
      phone: "+44 20 7946 0000",
      email: "hello@example.test",
      website: "https://example.test",
      address: "1 High Street",
      description: "Local plumbing and heating services.",
      category: "Plumbing & Heating",
      logo_alt: "CodeEdge Plumbing logo",
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["website", "http://example.test"],
    ["website", "https://user:pass@example.test"],
    ["email", "not-an-email"],
    ["phone", "call me now!"],
  ])("rejects unsafe or malformed profile %s", (field, value) => {
    const profile = {
      trading_name: "",
      phone: "",
      email: "",
      website: "",
      address: "",
      description: "",
      category: "",
      logo_alt: "",
      [field]: value,
    };

    expect(businessProfileSchema.safeParse(profile).success).toBe(false);
  });

  it("normalizes a Service price to pence", () => {
    const result = serviceSchema.parse({
      name: "Boiler repair",
      description: "Emergency and scheduled boiler repair.",
      active: true,
      quote_required: true,
      starting_price_gbp: "50.25",
      display_order: "2",
    });

    expect(result.starting_price_gbp).toBe(5025);
    expect(result.display_order).toBe(2);
  });

  it.each(["-1", "10.999", "1000000.01", "abc"])("rejects invalid Service price %s", (price) => {
    expect(serviceSchema.safeParse({
      name: "Boiler repair",
      description: "",
      active: true,
      quote_required: true,
      starting_price_gbp: price,
      display_order: "0",
    }).success).toBe(false);
  });

  it("accepts only UUID Service selectors", () => {
    expect(serviceIdSchema.safeParse("30000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(serviceIdSchema.safeParse("not-a-service").success).toBe(false);
  });
});
