import { describe, expect, it } from "vitest";
import { decideWhatsAppAutoReply } from "@/server/channels/whatsapp-auto-reply-policy";

describe("WhatsApp draft-only decision policy", () => {
  it("generates a practical greeting but never a send request", () => {
    expect(decideWhatsAppAutoReply("Hello")).toEqual({
      action: "draft",
      suggestion: expect.stringContaining("Welcome to Codeedge"),
    });
  });
  it("does not invent fixed prices", () => {
    expect(decideWhatsAppAutoReply("How much is a website?")).toMatchObject({
      action: "draft",
      suggestion: expect.stringMatching(/depends on your requirements/),
    });
  });
  it("supports social, SEO, and automation enquiries", () => {
    for (const [query, phrase] of [
      ["TikTok", "TikTok"], ["google maps", "SEO"], ["WhatsApp automation", "WhatsApp"],
    ]) {
      expect(decideWhatsAppAutoReply(query).suggestion).toContain(phrase);
    }
  });
  it("handoffs to human without suggesting an automated response", () => {
    expect(decideWhatsAppAutoReply("I want a human agent")).toEqual({
      action: "human_requested", suggestion: "",
    });
  });
  it("preserves explicit STOP/opt-out with no reply", () => {
    for (const body of ["STOP", "unsubscribe", "band karo"]) {
      expect(decideWhatsAppAutoReply(body)).toEqual({
        action: "opt_out", suggestion: "",
      });
    }
  });
  it("handles unknown enquiries conservatively", () => {
    expect(decideWhatsAppAutoReply("Something unrelated")).toMatchObject({
      action: "draft", suggestion: expect.stringContaining("Codeedge"),
    });
  });
});
