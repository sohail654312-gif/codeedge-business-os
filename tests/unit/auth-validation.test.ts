import { describe, expect, it } from "vitest";
import { loginSchema } from "../../src/modules/auth/validation";

describe("login validation", () => {
  it("accepts a normal email/password pair", () => {
    expect(loginSchema.safeParse({
      email: "owner@example.com",
      password: "correct horse battery staple",
    }).success).toBe(true);
  });

  it.each([
    ["email", "not-an-email"],
    ["email", `${"x".repeat(250)}@example.com`],
    ["password", ""],
    ["password", "x".repeat(257)],
  ])("rejects invalid %s", (field, value) => {
    const input = {
      email: "owner@example.com",
      password: "password",
      [field]: value,
    };
    expect(loginSchema.safeParse(input).success).toBe(false);
  });
});
