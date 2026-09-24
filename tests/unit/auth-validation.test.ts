import { describe, expect, it } from "vitest";
import { loginSchema, signupSchema } from "../../src/modules/auth/validation";

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

describe("owner signup validation", () => {
  const valid = {
    business_name: "CodeEdge Test Business",
    email: "owner@example.com",
    password: "a-strong-password-123",
    confirmation: "a-strong-password-123",
  };

  it("accepts a new business owner signup", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["business_name", "x"],
    ["business_name", "x".repeat(121)],
    ["email", "invalid"],
    ["password", "short"],
    ["confirmation", "different-password"],
  ])("rejects invalid signup %s", (field, value) => {
    expect(signupSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});
