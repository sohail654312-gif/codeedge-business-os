import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../../src/server/env";

function jwtWithRole(role: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ role })}.signature`;
}

const valid = {
  NEXT_PUBLIC_APP_URL: "https://business.codeedge.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
};

describe("runtime environment validation", () => {
  it("accepts hosted HTTPS configuration", () => {
    expect(parseEnvironment(valid)).toEqual(valid);
  });

  it("accepts localhost for development", () => {
    expect(parseEnvironment({
      ...valid,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwtWithRole("anon"),
    })).toBeTruthy();
  });

  it("rejects privileged Supabase JWTs", () => {
    expect(() => parseEnvironment({
      ...valid,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwtWithRole("service_role"),
    })).toThrow(/publishable|anon|environment/i);
  });

  it("rejects insecure hosted HTTP URLs", () => {
    expect(() => parseEnvironment({
      ...valid,
      NEXT_PUBLIC_APP_URL: "http://business.codeedge.example",
    })).toThrow(/environment/i);
  });
});
