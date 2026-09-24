import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const noteA = "50000000-0000-4000-8000-000000000001";
const noteB = "50000000-0000-4000-8000-000000000002";

describe("Business OS Lead note tenant isolation", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);
    await db.query(
      `insert into public.lead_notes(id,business_id,lead_id,body,created_by) values
        ($1,$2,$3,'Business A note',$4),
        ($5,$6,$7,'Business B note',$8)`,
      [noteA, f.businessA, f.leadA, f.ownerA, noteB, f.businessB, f.leadB, f.ownerB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT lead_note_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT lead_note_security_case; RELEASE SAVEPOINT lead_note_security_case");
  });

  it.each([
    [f.ownerA, noteA],
    [f.staffA, noteA],
    [f.ownerB, noteB],
  ])("member reads only notes from their tenant", async (userId, expectedNoteId) => {
    await asUser(db, userId);
    expect((await db.query("select id from public.lead_notes")).rows)
      .toEqual([{ id: expectedNoteId }]);
  });

  it("allows staff to add an internal note to an own-tenant Lead", async () => {
    await asUser(db, f.staffA);
    const result = await db.query<{ created_by: string }>(
      `insert into public.lead_notes(business_id,lead_id,body,created_by)
       values ($1,$2,'Staff follow-up',$3)
       returning created_by`,
      [f.businessA, f.leadA, f.staffA],
    );
    expect(result.rows).toEqual([{ created_by: f.staffA }]);
  });

  it("rejects cross-tenant note creation", async () => {
    await asUser(db, f.staffA);
    await expect(db.query(
      `insert into public.lead_notes(business_id,lead_id,body,created_by)
       values ($1,$2,'Attack',$3)`,
      [f.businessB, f.leadB, f.staffA],
    )).rejects.toThrow(/row-level security/);
  });

  it("rejects forged note creators", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      `insert into public.lead_notes(business_id,lead_id,body,created_by)
       values ($1,$2,'Forged',$3)`,
      [f.businessA, f.leadA, f.ownerB],
    )).rejects.toThrow(/row-level security/);
  });

  it("rejects cross-tenant Lead relationships even inside an allowed business", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      `insert into public.lead_notes(business_id,lead_id,body,created_by)
       values ($1,$2,'Wrong Lead',$3)`,
      [f.businessA, f.leadB, f.ownerA],
    )).rejects.toThrow(/foreign key/);
  });

  it("keeps notes append-only for staff and owners", async () => {
    await asUser(db, f.ownerA);
    await expect(db.query(
      "update public.lead_notes set body='Edited' where id=$1",
      [noteA],
    )).rejects.toThrow(/permission denied/);
  });

  it("prevents staff from deleting notes", async () => {
    await asUser(db, f.staffA);
    expect((await db.query(
      "delete from public.lead_notes where id=$1 returning id",
      [noteA],
    )).rows).toEqual([]);
  });

  it("allows owners to delete only own-tenant notes", async () => {
    await asUser(db, f.ownerA);
    expect((await db.query(
      "delete from public.lead_notes where id=$1 returning id",
      [noteB],
    )).rows).toEqual([]);
    expect((await db.query(
      "delete from public.lead_notes where id=$1 returning id",
      [noteA],
    )).rows).toEqual([{ id: noteA }]);
  });

  it("deletes Lead notes when the parent Lead is deleted", async () => {
    await asUser(db, f.ownerA);
    await db.query("delete from public.leads where id=$1", [f.leadA]);
    expect((await db.query(
      "select id from public.lead_notes where id=$1",
      [noteA],
    )).rows).toEqual([]);
  });

  it("denies anonymous access to internal notes", async () => {
    await asUser(db, null);
    await expect(db.query("select * from public.lead_notes"))
      .rejects.toThrow(/permission denied/);
  });

  it("enables and forces RLS on internal notes", async () => {
    const result = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public' and relname='lead_notes'`,
    );
    expect(result.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  });
});
