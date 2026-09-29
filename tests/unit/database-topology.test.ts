import { describe, expect, it } from "vitest";
import { classifyDatabaseHost } from "@/server/db/topology";

describe("restricted database topology classification", () => {
  it("classifies Supabase direct hosts without exposing credentials", () => {
    expect(classifyDatabaseHost(
      "postgresql://user:secret@db.abc123.supabase.co:5432/postgres?sslmode=verify-full",
    )).toBe("supabase_direct");
  });

  it("classifies Supavisor transaction pooler by port", () => {
    expect(classifyDatabaseHost(
      "postgresql://user:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=verify-full",
    )).toBe("supavisor_transaction_pooler");
  });

  it("classifies Supavisor session pooler", () => {
    expect(classifyDatabaseHost(
      "postgresql://user:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
    )).toBe("supavisor_session_pooler");
  });

  it("reports missing values without inventing a topology", () => {
    expect(classifyDatabaseHost(undefined)).toBe("not_configured");
  });
});
