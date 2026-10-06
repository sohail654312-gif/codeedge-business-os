import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cigoReadResourceKinds } from "@/server/cigo/contract";

const migration = readFileSync(
  "supabase/migrations/20261006000100_cigo_read_v1.sql",
  "utf8",
);

describe("CIGO read-only projection security", () => {
  it("uses an isolated non-login, no-inherit, no-bypass role with execute-only access", () => {
    expect(migration).toContain("create role codeedge_cigo_read_api nologin noinherit nobypassrls");
    expect(migration).toContain("grant execute on function public.cigo_read_v1");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\./i);
  });

  it("contains the exact application resource allowlist", () => {
    for (const resource of cigoReadResourceKinds) {
      expect(migration).toContain(`'${resource}'`);
    }
  });

  it("does not project provider secrets or direct contact/message contents", () => {
    const forbidden = [
      "credential_key",
      "api_secret",
      "access_token",
      "message.body",
      "m.body",
      "contact_phone",
      "contact_email",
      "lead.email",
      "lead.phone",
      "appointment.notes",
    ];
    for (const value of forbidden) {
      expect(migration.toLowerCase()).not.toContain(value.toLowerCase());
    }
  });
});
