import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { asUser,fixtures as f,openDatabase,seedDatabase,type TestDatabase } from "../helpers/database";
describe("Final CRM directory and pagination",() => {
  let db:TestDatabase;
  beforeAll(async()=>{
    db=await openDatabase(); await seedDatabase(db);
    await db.query(`insert into public.leads(business_id,contact_name,phone,source,enquiry_summary,created_by)
      select $1,'Page Lead '||g,'123','manual','Paged',$2 from generate_series(1,260) g`,[f.businessA,f.ownerA]);
  });
  afterAll(async()=>db.close());
  beforeEach(async()=>db.exec("SAVEPOINT crm_case"));
  afterEach(async()=>db.exec("ROLLBACK TO SAVEPOINT crm_case; RELEASE SAVEPOINT crm_case"));
  async function page(business=f.businessA,page:number|null=1,service:string|null=null) {
    const result=await db.query<{ result:{ rows:{id:string}[];total:number;page:number;pageSize:number } }>(
      "select public.search_leads_page($1,null,null,null,$3,$2) result",[business,page,service]);
    return result.rows[0].result;
  }
  async function create(business=f.businessA,actor=f.ownerA) {
    return db.query("insert into public.customers(id,business_id,contact_name,phone,email,created_by) values ('50000000-0000-4000-8000-000000000099',$1,'Direct','123','',$2) returning id",[business,actor]);
  }
  it.each([f.ownerA,f.staffA])("allows member %s to create and edit Customers",async user=>{
    await asUser(db,user); const id=(await create(f.businessA,user)).rows[0].id;
    expect((await db.query("update public.customers set contact_name='Edited' where id=$1 returning source_lead_id",[id])).rows).toEqual([{source_lead_id:null}]);
    expect((await db.query<{result:{total:number}}>("select public.search_customers_page($1,'edited',1) result",[f.businessA])).rows[0].result.total).toBe(1);
  });
  it("prevents duplicate request identity",async()=>{
    await asUser(db,f.ownerA);await create();await expect(create()).rejects.toThrow(/duplicate key/);
  });
  it.each([f.ownerB,f.removedA])("denies unauthorized member %s",async user=>{
    await asUser(db,user);await expect(create(f.businessA,user)).rejects.toThrow(/row-level security/);
  });
  it("rejects forged business ID",async()=>{
    await asUser(db,f.ownerA);await expect(create(f.businessB,f.ownerA)).rejects.toThrow(/row-level security/);
  });
  it("rejects forged creator",async()=>{
    await asUser(db,f.ownerA);await expect(create(f.businessA,f.ownerB)).rejects.toThrow(/row-level security/);
  });
  it("does not grant source changes",async()=>{
    await asUser(db,f.ownerA);await create();
    await expect(db.exec("update public.customers set source_lead_id=null")).rejects.toThrow(/permission denied/);
  });
  it("does not grant delete",async()=>{
    await asUser(db,f.ownerA);await expect(db.exec("delete from public.customers")).rejects.toThrow(/permission denied/);
  });
  it("isolates Customer reads and edits",async()=>{
    await asUser(db,f.ownerA);const id=(await create()).rows[0].id;
    await asUser(db,f.ownerB);
    expect((await db.query("select id from public.customers where id=$1",[id])).rows).toEqual([]);
    expect((await db.query("update public.customers set phone='999' where id=$1 returning id",[id])).rows).toEqual([]);
    expect((await db.query<{result:{total:number}}>("select public.search_customers_page($1,null,1) result",[f.businessA])).rows[0].result.total).toBe(0);
  });
  it("counts beyond 250 and returns stable disjoint pages",async()=>{
    await asUser(db,f.ownerA);const first=await page(),second=await page(f.businessA,2),last=await page(f.businessA,6);
    expect(first.total).toBe(261);expect(first.rows).toHaveLength(50);expect(last.rows).toHaveLength(11);
    expect(first.rows).toEqual((await page()).rows);
    expect(second.rows.some(row=>first.rows.some(other=>other.id===row.id))).toBe(false);
    expect((await page(f.businessA,7)).total).toBe(261);expect((await page(f.businessA,7)).rows).toEqual([]);
  });
  it("isolates forged business/service filters and revoked access",async()=>{
    await asUser(db,f.ownerA);expect((await page(f.businessB)).total).toBe(0);expect((await page(f.businessA,1,f.serviceB)).total).toBe(0);
    await asUser(db,f.removedA);expect((await page()).total).toBe(0);
  });
  it.each([0,-1,10001,null])("rejects malformed page %s",async value=>{
    await asUser(db,f.ownerA);await expect(page(f.businessA,value)).rejects.toThrow(/invalid_pagination/);
  });
  it("denies anonymous access",async()=>{
    await asUser(db,null);await expect(page()).rejects.toThrow(/permission denied/);
  });
});
