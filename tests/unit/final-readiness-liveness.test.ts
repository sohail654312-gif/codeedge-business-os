import { afterEach,describe,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
import { configurationReady } from "@/server/readiness";
const mocks=vi.hoisted(()=>({health:vi.fn(),run:vi.fn()}));
vi.mock("@/server/automation/health",()=>({getAutomationRuntimeHealth:mocks.health}));
vi.mock("@/server/automation/runner",()=>({runPendingAutomations:mocks.run}));
import { POST } from "@/app/api/internal/automation/run/route";
describe("Readiness and non-effect liveness",()=>{
  afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
  const env={NEXT_PUBLIC_APP_URL:"https://test.example.test",NEXT_PUBLIC_SUPABASE_URL:"https://test.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test_only_123456789",CHAT_DATABASE_URL:"postgresql://restricted:placeholder@db.test.supabase.co/postgres?sslmode=verify-full",COMMUNICATION_DATABASE_URL:"postgresql://restricted:placeholder@db.test.supabase.co/postgres?sslmode=verify-full",AUTOMATION_RUNNER_SECRET:"test_only_".repeat(4)};
  it("validates configuration instead of accepting any nonempty values",()=>{
    expect(configurationReady(env)).toBe(true);
    for(const name of Object.keys(env)) expect(configurationReady({...env,[name]:"invalid"})).toBe(false);
    expect(configurationReady({...env,AUTOMATION_RUNNER_SECRET:" ".repeat(40)})).toBe(false);
    expect(configurationReady({...env,CHAT_DATABASE_URL:env.CHAT_DATABASE_URL.replace("verify-full","require")})).toBe(false);
  });
  it("never claims or executes automations during a healthy probe",async()=>{
    vi.stubEnv("AUTOMATION_RUNNER_SECRET",env.AUTOMATION_RUNNER_SECRET);
    mocks.health.mockResolvedValue({healthy:true,pendingCount:0});
    const result=await POST(new NextRequest("https://test.example.test/api/internal/automation/run?probe=1",{method:"POST",headers:{authorization:`Bearer ${env.AUTOMATION_RUNNER_SECRET}`}}));
    expect(result.status).toBe(200);expect(await result.json()).toMatchObject({probe:true,status:"ok"});expect(mocks.run).not.toHaveBeenCalled();
  });
  it("rejects an unauthorized probe before database access",async()=>{
    vi.stubEnv("AUTOMATION_RUNNER_SECRET",env.AUTOMATION_RUNNER_SECRET);
    const result=await POST(new NextRequest("https://test.example.test/api/internal/automation/run?probe=1",{method:"POST"}));
    expect(result.status).toBe(401);expect(mocks.health).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
  });
  it("returns retryable failure with no secret or provider effect",async()=>{
    vi.stubEnv("AUTOMATION_RUNNER_SECRET",env.AUTOMATION_RUNNER_SECRET);
    mocks.health.mockRejectedValue(new Error("sensitive details"));
    const result=await POST(new NextRequest("https://test.example.test/api/internal/automation/run?probe=1",{method:"POST",headers:{authorization:`Bearer ${env.AUTOMATION_RUNNER_SECRET}`}}));
    expect(result.status).toBe(503);expect(await result.text()).not.toContain("sensitive");expect(mocks.run).not.toHaveBeenCalled();
  });
});
