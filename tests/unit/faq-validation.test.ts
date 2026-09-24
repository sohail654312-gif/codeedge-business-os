import { describe, expect, it } from "vitest";
import { faqIdSchema, faqSchema } from "@/modules/faqs/validation";

describe("FAQ validation", () => {
  it("trims and accepts a valid plain-text FAQ", () => {
    expect(faqSchema.parse({
      question: "  Do you offer emergency callouts?  ",
      answer: "  Yes, subject to availability.  ",
      is_active: true,
      display_order: "3",
    })).toEqual({
      question: "Do you offer emergency callouts?",
      answer: "Yes, subject to availability.",
      is_active: true,
      display_order: 3,
    });
  });

  it.each([
    { question: "", answer: "Answer", is_active: true, display_order: "0" },
    { question: "Question", answer: "   ", is_active: true, display_order: "0" },
    { question: "Question", answer: "Answer", is_active: true, display_order: "-1" },
    { question: "Question", answer: "Answer", is_active: true, display_order: "10001" },
  ])("rejects invalid FAQ input %j", (value) => {
    expect(faqSchema.safeParse(value).success).toBe(false);
  });

  it("enforces FAQ text limits", () => {
    expect(faqSchema.safeParse({
      question: "q".repeat(301),
      answer: "Answer",
      is_active: true,
      display_order: "0",
    }).success).toBe(false);

    expect(faqSchema.safeParse({
      question: "Question",
      answer: "a".repeat(5001),
      is_active: true,
      display_order: "0",
    }).success).toBe(false);
  });

  it("accepts only UUID FAQ selectors", () => {
    expect(faqIdSchema.safeParse("60000000-0000-4000-8000-000000000001").success).toBe(true);
    expect(faqIdSchema.safeParse("not-an-faq").success).toBe(false);
  });
});
