import { describe,expect,it } from "vitest";
import { createERPNextFinanceEngine } from "@/server/finance/erpnext-engine";
import { demoFinanceEngine } from "@/server/finance/demo-engine";
import { financeEngineMetadata } from "@/server/finance/provider-metadata";
import { requireFinanceWriteCapability } from "@/server/finance/write-capability";
import { pageSchema,pageHref } from "@/modules/buy-from-me/pagination";
import { customerFormSchema } from "@/modules/buy-from-me/customers/validation";
describe("Truthful Finance capabilities and URL bounds",()=>{
  const engines={demo_finance:demoFinanceEngine,erpnext:createERPNextFinanceEngine({businessId:"20000000-0000-4000-8000-000000000001",baseUrl:"https://erp.example.test",apiKey:"testonly",apiSecret:"testonly"})};
  const methods={customers:"createCustomer",suppliers:"createSupplier",quotations:"createQuote",invoices:"createInvoice",payments:"recordPayment",bills:"createBill",expenses:"createExpense"} as const;
  it("advertised write capabilities match actual adapter methods",()=>{
    for(const [id,engine] of Object.entries(engines)) for(const [capability,method] of Object.entries(methods)) {
      expect((financeEngineMetadata[id as keyof typeof engines].writeCapabilities as readonly string[]).includes(capability)).toBe(typeof engine[method as keyof typeof engine] === "function");
    }
  });
  it("ERPNext listing never grants unsupported writes",()=>{
    for(const capability of ["suppliers","quotations","invoices"] as const) expect(()=>requireFinanceWriteCapability(engines.erpnext,capability)).toThrow();
    expect(()=>requireFinanceWriteCapability(engines.erpnext,"customers")).not.toThrow();
  });
  it.each(["-1","0","1.2","Infinity","10001","abc"])("bounds malformed page %s",value=>expect(pageSchema.parse(value)).toBe(1));
  it("preserves filters in navigation",()=>{
    expect(pageHref("/leads",{q:"a&b",status:"new",source:null},2)).toBe("/leads?q=a%26b&status=new&page=2");
  });
  it("validates Customer fields and contact method",()=>{
    const fields={customer_id:"50000000-0000-4000-8000-000000000001",contact_name:" Customer ",phone:"123",email:""};
    expect(customerFormSchema.parse(fields).contact_name).toBe("Customer");
    expect(customerFormSchema.safeParse({...fields,phone:"",email:""}).success).toBe(false);
    expect(customerFormSchema.safeParse({...fields,email:"invalid"}).success).toBe(false);
  });
});
