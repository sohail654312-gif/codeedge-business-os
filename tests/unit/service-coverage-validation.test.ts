import { describe, expect, it } from "vitest";
import {
  openingHoursSchema,
  postcodeSchema,
  serviceAreaIdSchema,
  serviceAreaSchema,
  weekdaySchema,
} from "@/modules/service-coverage/validation";

describe("Service Coverage validation", () => {
  it.each([
    ["sw1a", "SW1A"],
    ["sw1a1aa", "SW1A 1AA"],
    ["SW1A 1AA", "SW1A 1AA"],
    ["", ""],
  ])("normalizes UK postcode coverage hint %s", (value, expected) => {
    expect(postcodeSchema.parse(value)).toBe(expected);
  });

  it.each(["INVALID", "12345", "SW1A-1AA"])("rejects invalid UK postcode coverage hint %s", (value) => {
    expect(postcodeSchema.safeParse(value).success).toBe(false);
  });

  it("validates and normalizes a Service Area", () => {
    const result = serviceAreaSchema.parse({
      name: "Westminster",
      postcode: "sw1a1aa",
      notes: "Central London coverage.",
      active: true,
      display_order: "3",
    });

    expect(result).toEqual({
      name: "Westminster",
      postcode: "SW1A 1AA",
      notes: "Central London coverage.",
      active: true,
      display_order: 3,
    });
  });

  it.each([
    { name: "A", postcode: "", notes: "", active: true, display_order: "0" },
    { name: "Westminster", postcode: "", notes: "", active: true, display_order: "-1" },
    { name: "Westminster", postcode: "", notes: "", active: true, display_order: "10001" },
  ])("rejects invalid Service Area input %j", (value) => {
    expect(serviceAreaSchema.safeParse(value).success).toBe(false);
  });

  it("accepts normal same-day Opening Hours", () => {
    expect(openingHoursSchema.parse({
      is_closed: false,
      opens_at: "09:00",
      closes_at: "17:30",
    })).toEqual({
      is_closed: false,
      opens_at: "09:00",
      closes_at: "17:30",
    });
  });

  it("closed days discard any submitted times", () => {
    expect(openingHoursSchema.parse({
      is_closed: true,
      opens_at: "09:00",
      closes_at: "17:00",
    })).toEqual({
      is_closed: true,
      opens_at: null,
      closes_at: null,
    });
  });

  it.each([
    { is_closed: false, opens_at: "", closes_at: "17:00" },
    { is_closed: false, opens_at: "09:00", closes_at: "" },
    { is_closed: false, opens_at: "17:00", closes_at: "09:00" },
    { is_closed: false, opens_at: "09:00", closes_at: "09:00" },
    { is_closed: false, opens_at: "09:00:30", closes_at: "17:00" },
  ])("rejects invalid or partial Opening Hours %j", (value) => {
    expect(openingHoursSchema.safeParse(value).success).toBe(false);
  });

  it("accepts only Monday through Sunday weekday selectors", () => {
    expect(weekdaySchema.parse("1")).toBe(1);
    expect(weekdaySchema.parse("7")).toBe(7);
    expect(weekdaySchema.safeParse("0").success).toBe(false);
    expect(weekdaySchema.safeParse("8").success).toBe(false);
  });

  it("accepts only UUID Service Area selectors", () => {
    expect(serviceAreaIdSchema.safeParse("50000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(serviceAreaIdSchema.safeParse("not-an-area").success).toBe(false);
  });
});
