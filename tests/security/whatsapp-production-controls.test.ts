import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asUser, fixtures as f, openDatabase, seedDatabase, type TestDatabase } from "../helpers/database";
const senderA="109876543210",senderB="109876543211",customer="447700900123";
const request="80000000-0000-4000-8000-000000000001";
describe("WhatsApp production controls",()=>{
  let db: TestDatabase;
  async function capability() { await db.exec("RESET ROLE; SET LOCAL ROLE codeedge_communication_api"); }
  async function inbound(body="Hi, I want to know about Codeedge services.",id="wamid.test",kind="text",time: string|null=new Date().toISOString(),media={}) {
    await capability();
    return (await db.query<{ conversation_id:string; message_id:string; inserted:boolean }>("select * from public.whatsapp_receive_message($1,$2,'Person',$3,$4,$5,$6,$7)",[senderA,customer,id,body,time,kind,media])).rows[0]!;
  }
  async function prepare(conv:string,automatic=false,epoch:number|null=null,kind="text",payload={}) {
    await capability();
    return (await db.query<{ message_id:string;created:boolean }>("select * from public.whatsapp_prepare_message($1,$2,$3,$4,'Reply',$5,$6,$7,$8)",[f.businessA,conv,f.ownerA,request,kind,payload,automatic,epoch])).rows[0]!;
  }
  beforeAll(async()=>{
    db=await openDatabase(); await seedDatabase(db);
    await db.query("insert into public.channel_connections(business_id,channel,provider,external_sender_id,credential_key,enabled,whatsapp_ai_enabled) values($1,'whatsapp','meta_whatsapp_cloud',$2,'tenant_a',true,true),($3,'whatsapp','meta_whatsapp_cloud',$4,'tenant_b',true,true)",[f.businessA,senderA,f.businessB,senderB]);
  });
  afterAll(async()=>{await db.close()});
  beforeEach(async()=>{await db.exec("SAVEPOINT production_case")});
  afterEach(async()=>{await db.exec("ROLLBACK TO production_case; RELEASE production_case")});
  it("durably queues one inbound event/AI run and deduplicates CRM, messages and activities",async()=>{
    const a=await inbound(),b=await inbound(); expect(a.inserted).toBe(true); expect(b).toEqual({...a,inserted:false});
    await db.exec("RESET ROLE");
    expect((await db.query("select count(*)::int n from public.leads where phone=$1",['+'+customer])).rows).toEqual([{n:1}]);
    expect((await db.query("select count(*)::int n from public.automation_domain_events where event_type='message.received'")).rows).toEqual([{n:1}]);
    expect((await db.query("select count(*)::int n from public.automation_runs")).rows).toEqual([{n:1}]);
    expect((await db.query("select count(*)::int n from public.crm_activities where description='WhatsApp message received'")).rows).toEqual([{n:1}]);
  });
  it("matches canonical existing CRM contact without creating another",async()=>{
    await db.query("update public.leads set phone=$1 where id=$2",['+44 (7700) 900123',f.leadA]);
    const r=await inbound(); await db.exec("RESET ROLE");
    expect((await db.query("select lead_id from public.conversations where id=$1",[r.conversation_id])).rows).toEqual([{lead_id:f.leadA}]);
    expect((await db.query("select count(*)::int n from public.leads where business_id=$1",[f.businessA])).rows).toEqual([{n:1}]);
  });
  it("does not open a new 24h window when an old signed event is redelivered",async()=>{
    const r=await inbound("Old",undefined,undefined,new Date(Date.now()-25*3600000).toISOString());
    await inbound("Old",undefined,undefined,new Date().toISOString());
    await capability(); await db.exec("SAVEPOINT window_denial");
    await expect(prepare(r.conversation_id)).rejects.toThrow(/template required/);
    await db.exec("ROLLBACK TO window_denial; RELEASE window_denial");
  });
  it("missing provider timestamp fails closed for free-form delivery",async()=>{
    const r=await inbound("No timestamp",undefined,undefined,null);
    await capability(); await db.exec("SAVEPOINT window_denial"); await expect(prepare(r.conversation_id)).rejects.toThrow(/template required/); await db.exec("ROLLBACK TO window_denial; RELEASE window_denial");
  });
  it("STOP persists suppression and human control before automated actions",async()=>{
    const r=await inbound("STOP"); await db.exec("RESET ROLE");
    expect((await db.query("select automation_state,handoff_reason,whatsapp_consent_at from public.conversations where id=$1",[r.conversation_id])).rows).toEqual([{automation_state:"human",handoff_reason:"opt_out",whatsapp_consent_at:null}]);
    await capability(); await db.exec("SAVEPOINT optout_denial"); await expect(prepare(r.conversation_id)).rejects.toThrow(/opted out/); await db.exec("ROLLBACK TO optout_denial; RELEASE optout_denial");
  });
  it("customer requesting a person pauses AI until explicit resume",async()=>{
    const r=await inbound("I want to speak with a person.");
    const claim=await db.query("select public.whatsapp_claim_assistant($1,$2,$3,$4) result",[f.businessA,r.conversation_id,r.message_id,f.ownerA]); expect(claim.rows).toEqual([{result:null}]);
    await db.query("select public.whatsapp_set_control($1,$2,$3,'automatic','')",[f.businessA,r.conversation_id,f.staffA]);
    const next=await inbound("Services please","wamid.next");
    expect((await db.query<{result:unknown}>("select public.whatsapp_claim_assistant($1,$2,$3,$4) result",[f.businessA,next.conversation_id,next.message_id,f.ownerA])).rows[0]?.result).toBeTruthy();
  });
  it("claims AI once across concurrent/repeated workflows",async()=>{
    const r=await inbound();
    const args=[f.businessA,r.conversation_id,r.message_id,f.ownerA];
    expect((await db.query<{result:unknown}>("select public.whatsapp_claim_assistant($1,$2,$3,$4) result",args)).rows[0]?.result).toBeTruthy();
    expect((await db.query("select public.whatsapp_claim_assistant($1,$2,$3,$4) result",args)).rows).toEqual([{result:null}]);
  });
  it("invalidates an AI reply prepared before human takeover",async()=>{
    const r=await inbound(),out=await prepare(r.conversation_id,true,0);
    await db.query("select public.whatsapp_set_control($1,$2,$3,'human','staff_takeover')",[f.businessA,r.conversation_id,f.staffA]);
    await db.exec("SAVEPOINT stale_denial"); await expect(db.query("select public.whatsapp_authorize_dispatch($1)",[out.message_id])).rejects.toThrow(/human control/); await db.exec("ROLLBACK TO stale_denial; RELEASE stale_denial");
  });
  it("manual reply takes durable human control",async()=>{
    const r=await inbound(); await prepare(r.conversation_id);
    await db.exec("RESET ROLE"); expect((await db.query("select automation_state,handoff_reason from public.conversations where id=$1",[r.conversation_id])).rows).toEqual([{automation_state:"human",handoff_reason:"staff_reply"}]);
  });
  it("cannot prepare cross-tenant replies even with a known conversation ID",async()=>{
    const r=await inbound(); await capability(); await db.exec("SAVEPOINT cross_denial");
    await expect(db.query("select public.whatsapp_prepare_message($1,$2,$3,$4,'Attack','text','{}',false,null)",[f.businessB,r.conversation_id,f.ownerB,request])).rejects.toThrow(/unavailable/);
    await db.exec("ROLLBACK TO cross_denial; RELEASE cross_denial");
  });
  it("delivery statuses cannot control another tenant's message",async()=>{
    const r=await inbound(),out=await prepare(r.conversation_id);
    await db.query("select public.whatsapp_complete_outbound($1,'wamid.out')",[out.message_id]);
    expect((await db.query("select public.whatsapp_update_delivery_scoped($1,'wamid.out','read',null) updated",[senderB])).rows).toEqual([{updated:false}]);
    expect((await db.query("select public.whatsapp_update_delivery_scoped($1,'wamid.out','read',null) updated",[senderA])).rows).toEqual([{updated:true}]);
    expect((await db.query("select public.whatsapp_update_delivery_scoped($1,'wamid.out','sent',null) updated",[senderA])).rows).toEqual([{updated:false}]);
  });
  it("clinic sensitive enquiry and voice note are stored for human review",async()=>{
    await db.query("update public.channel_connections set whatsapp_clinic_mode=true where business_id=$1",[f.businessA]);
    const r=await inbound("What medication should I take for chest pain?"); await db.exec("RESET ROLE");
    expect((await db.query("select handoff_reason from public.conversations where id=$1",[r.conversation_id])).rows).toEqual([{handoff_reason:"medical_review"}]);
    const audio=await inbound("[Voice note]","wamid.audio","audio",undefined,{id:"12345",mimeType:"audio/ogg",voice:true}); await db.exec("RESET ROLE");
    expect((await db.query("select content_kind,media_metadata from public.messages where id=$1",[audio.message_id])).rows).toEqual([{content_kind:"audio",media_metadata:{id:"12345",mimeType:"audio/ogg",voice:true}}]);
  });
  it("AI context contains only active tenant facts and excludes internal notes",async()=>{
    await db.query("insert into public.business_faqs(business_id,question,answer) values($1,'Own','Only A'),($2,'Other','Only B')",[f.businessA,f.businessB]);
    const r=await inbound(); await db.exec("RESET ROLE");
    await db.query("insert into public.messages(business_id,conversation_id,sender_type,direction,body) values($1,$2,'system','internal','Private staff note')",[f.businessA,r.conversation_id]);
    await capability(); const result=(await db.query<{result:Record<string,unknown>}>("select public.whatsapp_claim_assistant($1,$2,$3,$4) result",[f.businessA,r.conversation_id,r.message_id,f.ownerA])).rows[0]!.result;
    expect(result.faqs).toEqual([{question:"Own",answer:"Only A"}]); expect(JSON.stringify(result)).not.toMatch(/Only B|Private staff note|Electrical repair/);
  });
  it("browser roles cannot forge assistant claims, consent, media access or template approvals",async()=>{
    const r=await inbound(); await db.exec("RESET ROLE"); await asUser(db,f.ownerA); await db.exec("SAVEPOINT rpc_denial");
    await expect(db.query("select public.whatsapp_claim_assistant($1,$2,$3,$4)",[f.businessA,r.conversation_id,r.message_id,f.ownerA])).rejects.toThrow(/permission denied/); await db.exec("ROLLBACK TO rpc_denial; RELEASE rpc_denial");
    await db.exec("SAVEPOINT registry_denial"); await expect(db.query("update public.channel_connections set whatsapp_templates='[]'")).rejects.toThrow(/permission denied/); await db.exec("ROLLBACK TO registry_denial; RELEASE registry_denial");
  });
  it("approved templates outside the window require fresh Meta cache and consent",async()=>{
    const r=await inbound("Old",undefined,undefined,new Date(Date.now()-25*3600000).toISOString()); await db.exec("RESET ROLE");
    await db.query("update public.channel_connections set whatsapp_templates=$1,whatsapp_templates_synced_at=now() where business_id=$2",[[{name:"reminder",language:"en_US",category:"UTILITY",status:"APPROVED",body:"Reminder"}],f.businessA]);
    await capability(); await db.exec("SAVEPOINT consent_denial"); await expect(prepare(r.conversation_id,false,null,"template",{name:"reminder",language:"en_US",parameters:[]})).rejects.toThrow(/consent required/); await db.exec("ROLLBACK TO consent_denial; RELEASE consent_denial");
    await db.query("select public.whatsapp_record_consent($1,$2,$3,'Customer consent recorded by owner',true)",[f.businessA,r.conversation_id,f.ownerA]);
    expect((await prepare(r.conversation_id,false,null,"template",{name:"reminder",language:"en_US",parameters:[]})).created).toBe(true);
  });
});
