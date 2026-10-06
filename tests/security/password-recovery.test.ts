import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/auth/confirm/route";
import { requestPasswordRecovery, updateRecoveredPassword } from "@/modules/auth/recovery-actions";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn(), getUser: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), resetPasswordForEmail: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({ createClient: async () => ({ auth: mocks }) }));
vi.mock("@/server/env", () => ({ getEnvironment: () => ({ NEXT_PUBLIC_APP_URL: "https://staging.codeedge.test" }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

const form = (values: Record<string, string>) => {
  const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data;
};

describe("Password recovery authentication boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: "recovery" }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner", email_confirmed_at: "2026-10-05" } }, error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it.each(["", "?type=recovery&token_hash=bad", `?type=signup&token_hash=${"a".repeat(64)}`])("rejects missing, malformed and non-recovery tokens: %s", async query => {
    const response = await GET(new NextRequest(`https://untrusted.test/auth/confirm${query}`));
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://staging.codeedge.test/forgot-password?recovery=invalid");
  });

  it("consumes only a recovery token and ignores supplied next/host redirects", async () => {
    const token = "a".repeat(64);
    const response = await GET(new NextRequest(`https://untrusted.test/auth/confirm?type=recovery&token_hash=${token}&next=https://attacker.test`));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: token, type: "recovery" });
    expect(response.headers.get("location")).toBe("https://staging.codeedge.test/reset-password");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(["a".repeat(56), `pkce_${"b".repeat(56)}`])("accepts bounded GoTrue SHA-224 and PKCE token formats", async token => {
    const response = await GET(new NextRequest(`https://staging.codeedge.test/auth/confirm?type=recovery&token_hash=${token}`));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: token, type: "recovery" });
    expect(response.headers.get("location")).toBe("https://staging.codeedge.test/reset-password");
  });

  it("exchanges the default-template PKCE code and ignores arbitrary next redirects", async () => {
    const code = "34e770dd-9ff9-416c-87fa-43b31d7ef225";
    const response = await GET(new NextRequest(`https://staging.codeedge.test/auth/confirm?code=${code}&next=https://attacker.test`));
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith(code);
    expect(response.headers.get("location")).toBe("https://staging.codeedge.test/reset-password");
  });

  it("rejects unverified PKCE accounts and invalid or missing verifier codes", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
    const response = await GET(new NextRequest(`https://staging.codeedge.test/auth/confirm?code=${"a".repeat(36)}`));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("location")).toContain("recovery=invalid");
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { redirectType: null }, error: { message: "bad verifier" } });
    const rejected = await GET(new NextRequest(`https://staging.codeedge.test/auth/confirm?code=${"b".repeat(36)}`));
    expect(rejected.headers.get("location")).toContain("recovery=invalid");
  });

  it("fails closed for expired or consumed recovery tokens without reflecting provider errors", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "private provider diagnostics" } });
    const response = await GET(new NextRequest(`https://staging.codeedge.test/auth/confirm?type=recovery&token_hash=${"b".repeat(64)}`));
    expect(response.headers.get("location")).toBe("https://staging.codeedge.test/forgot-password?recovery=invalid");
  });

  it.each([null, { id: "unconfirmed", email_confirmed_at: null }])("does not change passwords for missing or unverified users", async user => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    const result = await updateRecoveredPassword({}, form({ password: "test-password-long", confirmation: "test-password-long" }));
    expect(result.error).toBe("Open a valid recovery link before setting a new password.");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("rejects short or mismatched passwords before accessing Auth", async () => {
    await updateRecoveredPassword({}, form({ password: "short", confirmation: "short" }));
    await updateRecoveredPassword({}, form({ password: "test-password-long", confirmation: "different-password" }));
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("updates only the authenticated user and ends its local session before sign-in", async () => {
    await expect(updateRecoveredPassword({}, form({ password: "test-password-long", confirmation: "test-password-long" })))
      .rejects.toThrow("redirect:/login?password=updated");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "test-password-long" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps recovery-request responses identical and uses the configured callback", async () => {
    const known = await requestPasswordRecovery({}, form({ email: "owner@example.test" }));
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { message: "unknown user" } });
    expect(await requestPasswordRecovery({}, form({ email: "missing@example.test" }))).toEqual(known);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("missing@example.test", { redirectTo: "https://staging.codeedge.test/auth/confirm" });
  });

  it("reports the project-wide email limit without revealing account existence or provider diagnostics", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit", message: "private provider diagnostics" } });
    const known = await requestPasswordRecovery({}, form({ email: "owner@example.test" }));
    const missing = await requestPasswordRecovery({}, form({ email: "missing@example.test" }));
    expect(missing).toEqual(known);
    expect(known.success).toBeUndefined();
    expect(known.error).toContain("email limit");
    expect(known.error).not.toContain("private provider diagnostics");
  });

  it("reports transport unavailability without exposing the exception", async () => {
    mocks.resetPasswordForEmail.mockRejectedValue(new Error("private transport diagnostics"));
    const result = await requestPasswordRecovery({}, form({ email: "owner@example.test" }));
    expect(result).toEqual({ error: "Recovery email is temporarily unavailable. Please try again later." });
  });
});
