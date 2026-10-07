import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetaWhatsAppProvider, parseMetaWebhook } from "@/server/channels/meta-whatsapp";
import { decideWhatsAppReply, type WhatsAppAssistantContext, whatsappMissingInformation, whatsappAssistantRequestId } from "@/server/ai/whatsapp-assistant";
import { transcribeWhatsAppAudio } from "@/server/transcription/provider";
import type { AIModelProvider } from "@/server/ai/provider";
const businessId="20000000-0000-4000-8000-000000000001";
const input={ businessId,providerEnvironment:"production" as const,externalSenderId:"109876543210",credentialKey:"tenant_a",recipient:"447700900123",body:"Reply" };
function configured(){ process.env.WHATSAPP_META_GRAPH_API_VERSION="v99.0";process.env.WHATSAPP_META_CREDENTIALS_JSON=JSON.stringify({tenant_a:{businessId,provider:"meta_whatsapp_cloud",environment:"production",externalSenderId:input.externalSenderId,externalAccountId:"123456",secret:"synthetic-token-never-a-real-secret"}}); }
const context:WhatsAppAssistantContext={businessId,name:"Codeedge",executionMode:"production",epoch:0,clinicMode:false,text:"What services do you provide?",timezone:"Asia/Karachi",profile:null,services:[{name:"Software development",description:"",pricePence:null,quoteRequired:true}],faqs:[],hours:[],history:[]};
function model(text:string):AIModelProvider{return {id:"openai_compatible",model:"synthetic",generate:vi.fn(async()=>({text,toolCalls:[],provider:"openai_compatible" as const,model:"synthetic"}))};}
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();delete process.env.WHATSAPP_META_GRAPH_API_VERSION;delete process.env.WHATSAPP_META_CREDENTIALS_JSON;delete process.env.WHATSAPP_TRANSCRIPTION_ENABLED;});
describe("Meta WhatsApp expanded capabilities",()=>{
  it("normalizes button and audio metadata and ignores future fields/statuses independently",()=>{
    const result=parseMetaWebhook({object:"whatsapp_business_account",entry:[{changes:[{field:"future_field",value:{}},{field:"messages",value:{metadata:{phone_number_id:input.externalSenderId},messages:[{type:"future"},{from:input.recipient,id:"wamid.button",type:"button",timestamp:"1791400000",button:{text:"Services"}},{from:input.recipient,id:"wamid.audio",type:"audio",audio:{id:"12345",mime_type:"audio/ogg",voice:true}}],statuses:[{id:"future_status",status:"future"}]}}]}]});
    expect(result.messages).toHaveLength(2);expect(result.messages[0]).toMatchObject({body:"Services",contentKind:"interactive",occurredAt:expect.any(String)});expect(result.messages[1]).toMatchObject({body:"[Voice note]",contentKind:"audio",media:{id:"12345",mimeType:"audio/ogg",voice:true}});expect(result.statuses).toEqual([]);
  });
  it("sends templates/interactive/media with bounded requests and explicit version",async()=>{
    configured();const fetcher=vi.fn(async()=>Response.json({messages:[{id:"wamid.sent"}]}));const p=createMetaWhatsAppProvider(fetcher);
    await p.sendTemplate({...input,name:"appointment_confirmation",language:"en_US",parameters:["Sohail"]});await p.sendInteractiveMessage({...input,buttons:[{id:"services",title:"Services"}]});await p.sendMedia({...input,type:"document",mediaId:"12345"});
    expect(fetcher).toHaveBeenCalledTimes(3);const bodies=fetcher.mock.calls.map(call=>JSON.parse(String((call as unknown as [unknown,RequestInit])[1].body)));expect(bodies.map(b=>b.type)).toEqual(["template","interactive","document"]);
  });
  it("rate limits are surfaced without retry storms or provider detail leakage",async()=>{
    configured();const fetcher=vi.fn(async()=>Response.json({error:{code:4,message:"sensitive provider detail"}},{status:429}));
    await expect(createMetaWhatsAppProvider(fetcher).sendText(input)).rejects.toMatchObject({code:"meta_rate_limited",message:"External provider delivery failed."});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("invalid tokens and malformed accepted responses do not pretend delivery succeeded",async()=>{
    configured();await expect(createMetaWhatsAppProvider(vi.fn(async()=>Response.json({error:{code:190}},{status:401}))).sendText(input)).rejects.toMatchObject({code:"meta_190"});
    await expect(createMetaWhatsAppProvider(vi.fn(async()=>Response.json({}))).sendText(input)).rejects.toMatchObject({code:"meta_invalid_response"});
  });
  it("WABA template access is bound to server credential metadata",async()=>{
    configured();const fetcher=vi.fn();await expect(createMetaWhatsAppProvider(fetcher).listTemplates({...input,accountId:"654321"})).rejects.toThrow(/credential/);expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects arbitrary media URLs before sending authorization tokens",async()=>{
    configured();const fetcher=vi.fn(async()=>Response.json({id:"12345",url:"https://attacker.example/media",file_size:1,mime_type:"audio/ogg"}));
    await expect(createMetaWhatsAppProvider(fetcher).downloadMedia({...input,mediaId:"12345",maxBytes:1000})).rejects.toMatchObject({code:"media_not_allowed"});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("limits streamed media bytes and disables redirects",async()=>{
    configured();const fetcher=vi.fn().mockResolvedValueOnce(Response.json({id:"12345",url:"https://lookaside.fbsbx.com/media",file_size:2,mime_type:"audio/ogg"})).mockResolvedValueOnce(new Response(new Uint8Array(10)));
    await expect(createMetaWhatsAppProvider(fetcher).downloadMedia({...input,mediaId:"12345",maxBytes:5})).rejects.toMatchObject({code:"media_too_large"});expect(fetcher.mock.calls[1][1]).toMatchObject({redirect:"error"});
  });
});
describe("controlled WhatsApp assistant",()=>{
  it("returns exact approved FAQs without requiring an LLM",async()=>{
    await expect(decideWhatsAppReply({...context,text:"What is your confirmed price?",faqs:[{question:"What is your confirmed price?",answer:"The approved package costs PKR 50,000."}]})).resolves.toMatchObject({body:"The approved package costs PKR 50,000.",handoff:false});
  });
  it("uses AI to select approved tenant knowledge and never model-authored business facts",async()=>{
    const p=model('{"index":0,"confidence":0.96}');await expect(decideWhatsAppReply({...context,text:"Hi, I want to know about Codeedge services."},p)).resolves.toMatchObject({body:"Our services include Software development.",handoff:false});
    expect(p.generate).toHaveBeenCalledTimes(1);
  });
  it("unknown pricing, low confidence and nonexistent answer indexes offer human help",async()=>{
    await expect(decideWhatsAppReply({...context,text:"How much is X?"})).resolves.toMatchObject({body:whatsappMissingInformation,handoff:true});
    await expect(decideWhatsAppReply(context,model('{"index":0,"confidence":0.3}'))).resolves.toHaveProperty("handoff",true);
    await expect(decideWhatsAppReply(context,model('{"index":99,"confidence":1}'))).resolves.toHaveProperty("handoff",true);
  });
  it("human, booking, and clinical requests bypass AI generation",async()=>{
    const p=model('fabricated medicine');for(const text of ["I want to speak with a person.","Can I book an appointment?","What should I take?","Chest pain and trouble breathing"]){const decision=await decideWhatsAppReply({...context,text,clinicMode:true},p);expect(decision).toMatchObject({body:null,handoff:true});}expect(p.generate).not.toHaveBeenCalled();
  });
  it("reply idempotency uses inbound message identity across workflows",()=>{expect(whatsappAssistantRequestId("a")).toBe(whatsappAssistantRequestId("a"));expect(whatsappAssistantRequestId("a")).not.toBe(whatsappAssistantRequestId("b"));});
  it("transcription stays optional, provider neutral and off for clinics",async()=>{
    const p={id:"test",transcribe:vi.fn(async()=>({text:"Hello"}))};const audio={bytes:new Uint8Array(2),mimeType:"audio/ogg",clinicMode:false};
    expect(await transcribeWhatsAppAudio(audio,p)).toEqual({status:"disabled"});process.env.WHATSAPP_TRANSCRIPTION_ENABLED="true";expect(await transcribeWhatsAppAudio({...audio,clinicMode:true},p)).toEqual({status:"human_review"});expect(await transcribeWhatsAppAudio(audio)).toEqual({status:"provider_unavailable"});expect(await transcribeWhatsAppAudio(audio,p)).toEqual({status:"transcribed",text:"Hello"});expect(p.transcribe).toHaveBeenCalledTimes(1);
  });
});
