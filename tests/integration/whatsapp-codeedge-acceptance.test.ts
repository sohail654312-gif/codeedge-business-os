import { createHmac } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
import { fixtures as f,openDatabase,seedDatabase,type TestDatabase } from "../helpers/database";
import { GET,POST } from "@/app/api/channels/whatsapp/meta/webhook/route";
import { runPendingAutomations } from "@/server/automation/runner";
import { createMetaWhatsAppProvider } from "@/server/channels/meta-whatsapp";
const state=vi.hoisted(()=>({db:null as TestDatabase|null,tasks:[] as Array<()=>Promise<void>>,fetcher:vi.fn(),generate:vi.fn()}));
vi.mock("@/server/channels/capability",()=>({withCommunicationCapability:async(callback:(db:TestDatabase)=>Promise<unknown>)=>{await state.db!.exec("RESET ROLE; SET LOCAL ROLE codeedge_communication_api");return callback(state.db!);}}));
vi.mock("@/server/automation/capability",()=>({withAutomationCapability:async(callback:(db:TestDatabase)=>Promise<unknown>)=>{await state.db!.exec("RESET ROLE; SET LOCAL ROLE codeedge_automation_api");return callback(state.db!);}}));
vi.mock("@/server/ai/registry",()=>({getAIProviderForContext:()=>({id:"openai_compatible",model:"synthetic",generate:state.generate})}));
vi.mock("@/server/channels/registry",async original=>({...await original<typeof import("@/server/channels/registry")>(),getTextCommunicationProvider:()=>createMetaWhatsAppProvider(state.fetcher)}));
vi.mock("next/server",async original=>({...await original<typeof import("next/server")>(),after:(task:()=>Promise<void>)=>state.tasks.push(task)}));
const sender="109876543210",customer="447700900123",secret="synthetic-app-secret";
function request(body:string,id:string){const raw=JSON.stringify({object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:sender},contacts:[{wa_id:customer,profile:{name:"New Codeedge prospect"}}],messages:[{id,from:customer,type:"text",timestamp:String(Math.floor(Date.now()/1000)),text:{body}}]}}]}]});return new NextRequest("https://codeedge.test/api/channels/whatsapp/meta/webhook",{method:"POST",body:raw,headers:{"x-hub-signature-256":"sha256="+createHmac("sha256",secret).update(raw).digest("hex")}});}
async function drain(){while(state.tasks.length)await state.tasks.shift()!();}
describe("Codeedge WhatsApp acceptance scenario with real database/services and synthetic providers",()=>{
 beforeAll(async()=>{
  state.db=await openDatabase();await seedDatabase(state.db);
  await state.db.query("update public.businesses set name='Codeedge' where id=$1",[f.businessA]);
  await state.db.query("insert into public.business_faqs(business_id,question,answer) values($1,'What services does Codeedge provide?','Codeedge provides approved software development and business automation services.')",[f.businessA]);
  await state.db.query("insert into public.channel_connections(business_id,channel,provider,external_sender_id,credential_key,enabled,whatsapp_ai_enabled) values($1,'whatsapp','meta_whatsapp_cloud',$2,'codeedge_test',true,true)",[f.businessA,sender]);
  process.env.WHATSAPP_META_APP_SECRET=secret;process.env.WHATSAPP_META_VERIFY_TOKEN="synthetic-verify";process.env.WHATSAPP_META_GRAPH_API_VERSION="v99.0";
  process.env.WHATSAPP_META_CREDENTIALS_JSON=JSON.stringify({codeedge_test:{businessId:f.businessA,provider:"meta_whatsapp_cloud",environment:"production",externalSenderId:sender,secret:"synthetic-access-token-only-for-tests"}});
  state.fetcher.mockResolvedValue(Response.json({messages:[{id:"wamid.codeedge.reply"}]}));
  state.generate.mockResolvedValue({text:'{"index":0,"confidence":0.99}',toolCalls:[],provider:"openai_compatible",model:"synthetic"});
 });
 afterAll(async()=>{await state.db!.close();for(const key of ["WHATSAPP_META_APP_SECRET","WHATSAPP_META_VERIFY_TOKEN","WHATSAPP_META_GRAPH_API_VERSION","WHATSAPP_META_CREDENTIALS_JSON"])delete process.env[key];});
 it("runs signed inbound → tenant → dedup → CRM → inbox → automation → approved AI reply → Meta → delivery → human handoff",async()=>{
  expect((await GET(new NextRequest("https://codeedge.test/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify&hub.challenge=1234"))).status).toBe(200);
  const first=await POST(request("Hi, I want to know about Codeedge services.","wamid.codeedge.inbound"));expect(first.status).toBe(200);await drain();
  expect(state.generate).toHaveBeenCalledTimes(1);expect(state.fetcher).toHaveBeenCalledTimes(1);
  const sent=JSON.parse(String(state.fetcher.mock.calls[0][1].body));expect(sent.text.body).toBe("Codeedge provides approved software development and business automation services.");expect(sent.to).toBe(customer);
  await state.db!.exec("RESET ROLE");
  const messages=(await state.db!.query<{direction:string;sender_type:string;body:string}>("select direction,sender_type,body from public.messages order by created_at,id")).rows;
  expect(messages).toHaveLength(2);expect(messages.some(m=>m.direction==="outbound"&&m.sender_type==="ai")).toBe(true);
  expect((await state.db!.query("select count(*)::int n from public.leads where phone=$1",['+'+customer])).rows).toEqual([{n:1}]);
  expect((await POST(request("Hi, I want to know about Codeedge services.","wamid.codeedge.inbound"))).status).toBe(200);await drain();expect(state.fetcher).toHaveBeenCalledTimes(1);expect(state.generate).toHaveBeenCalledTimes(1);
  const delivery=JSON.stringify({object:"whatsapp_business_account",entry:[{changes:[{field:"messages",value:{metadata:{phone_number_id:sender},statuses:[{id:"wamid.codeedge.reply",status:"delivered"}]}}]}]});
  expect((await POST(new NextRequest("https://codeedge.test/webhook",{method:"POST",body:delivery,headers:{"x-hub-signature-256":"sha256="+createHmac("sha256",secret).update(delivery).digest("hex")}}))).status).toBe(200);
  await state.db!.exec("RESET ROLE");expect((await state.db!.query("select status from public.message_deliveries")).rows).toEqual([{status:"delivered"}]);
  expect((await POST(request("I want to speak with a person.","wamid.codeedge.handoff"))).status).toBe(200);await drain();
  expect((await POST(request("Tell me more about services.","wamid.codeedge.after_handoff"))).status).toBe(200);await drain();
  expect(state.fetcher).toHaveBeenCalledTimes(1);expect(state.generate).toHaveBeenCalledTimes(1);
  await state.db!.exec("RESET ROLE");expect((await state.db!.query("select automation_state,status from public.conversations where channel='whatsapp'")).rows).toEqual([{automation_state:"human",status:"pending"}]);
  expect((await state.db!.query("select count(*)::int n from public.crm_activities where description='WhatsApp message received'")).rows).toEqual([{n:3}]);
  await runPendingAutomations(10);expect(state.fetcher).toHaveBeenCalledTimes(1);
 });
});
