import { createHmac } from "node:crypto";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
import { GET,POST } from "@/app/api/channels/whatsapp/meta/webhook/route";
const mock=vi.hoisted(()=>({receive:vi.fn(),delivery:vi.fn(),tasks:[] as Array<()=>Promise<void>>,runner:vi.fn()}));
vi.mock("@/server/channels/whatsapp",()=>({receiveWhatsAppText:mock.receive,updateWhatsAppDelivery:mock.delivery,whatsappLog:vi.fn()}));
vi.mock("@/server/automation/runner",()=>({runPendingAutomations:mock.runner}));
vi.mock("next/server",async original=>({...await original<typeof import("next/server")>(),after:(task:()=>Promise<void>)=>mock.tasks.push(task)}));
const secret="synthetic-app-secret",token="synthetic-verification-token";
const payload={object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:"109876543210"},messages:[{id:"wamid.route",from:"447700900123",type:"text",timestamp:String(Math.floor(Date.now()/1000)),text:{body:"Hello"}}]}}]}]};
function req(body:string,signature=true,headers:Record<string,string>={}){return new NextRequest("https://codeedge.test/api/channels/whatsapp/meta/webhook",{method:"POST",headers:{"Content-Type":"application/json",...(signature?{"x-hub-signature-256":"sha256="+createHmac("sha256",secret).update(body).digest("hex")}:{}),...headers},body});}
beforeEach(()=>{vi.clearAllMocks();mock.tasks.length=0;process.env.WHATSAPP_META_APP_SECRET=secret;process.env.WHATSAPP_META_VERIFY_TOKEN=token;mock.receive.mockResolvedValue({inserted:true});});
afterEach(()=>{delete process.env.WHATSAPP_META_APP_SECRET;delete process.env.WHATSAPP_META_VERIFY_TOKEN;});
describe("production WhatsApp webhook route",()=>{
  it("verifies challenge without exposing the token",async()=>{const response=await GET(new NextRequest(`https://codeedge.test/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`));expect(response.status).toBe(200);expect(await response.text()).toBe("12345");});
  it("rejects incorrect mode/token and missing challenge",async()=>{expect((await GET(new NextRequest("https://codeedge.test/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1"))).status).toBe(403);expect((await GET(new NextRequest(`https://codeedge.test/webhook?hub.mode=subscribe&hub.verify_token=${token}`))).status).toBe(400);});
  it("fails closed when required webhook security is absent",async()=>{delete process.env.WHATSAPP_META_APP_SECRET;expect((await POST(req(JSON.stringify(payload)))).status).toBe(503);expect(mock.receive).not.toHaveBeenCalled();});
  it("rejects forged requests before touching CRM/inbox",async()=>{expect((await POST(req(JSON.stringify(payload),false))).status).toBe(401);expect(mock.receive).not.toHaveBeenCalled();});
  it("rejects signed malformed JSON/schema",async()=>{expect((await POST(req("{"))).status).toBe(400);expect((await POST(req('{}'))).status).toBe(400);});
  it("rejects declared and streamed oversized bodies",async()=>{expect((await POST(req("x",false,{"content-length":"999999"}))).status).toBe(413);expect((await POST(req("x".repeat(512*1024+1),false))).status).toBe(413);});
  it("stores inbound first, acknowledges Meta, then drains existing automation queue",async()=>{expect((await POST(req(JSON.stringify(payload)))).status).toBe(200);expect(mock.receive).toHaveBeenCalledTimes(1);expect(mock.runner).not.toHaveBeenCalled();await mock.tasks[0]();expect(mock.runner).toHaveBeenCalledWith(10);});
  it("duplicates do not schedule additional AI processing",async()=>{mock.receive.mockResolvedValue({inserted:false});expect((await POST(req(JSON.stringify(payload)))).status).toBe(200);expect(mock.tasks).toHaveLength(0);});
  it("database failures stay retryable and AI failures do not reject stored messages",async()=>{mock.receive.mockRejectedValueOnce(new Error("private database details"));expect((await POST(req(JSON.stringify(payload)))).status).toBe(503);mock.runner.mockRejectedValueOnce(new Error("AI unavailable"));expect((await POST(req(JSON.stringify(payload)))).status).toBe(200);await expect(mock.tasks[0]()).resolves.toBeUndefined();});
});
