import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export type TestDatabase = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
  exec: (sql: string) => Promise<unknown>;
  close: () => Promise<void>;
};

export async function openDatabase(): Promise<TestDatabase> {
  const db = new PGlite();

  await db.exec(`
    create role anon nologin nobypassrls;
    create role authenticated nologin nobypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz default now(),
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);

  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }

  await db.exec("BEGIN");

  return {
    query: (sql, params) => db.query(sql, params),
    exec: (sql) => db.exec(sql),
    close: async () => {
      await db.exec("ROLLBACK");
      await db.close();
    },
  };
}

export const fixtures = {
  ownerA: "10000000-0000-4000-8000-000000000001",
  ownerB: "10000000-0000-4000-8000-000000000002",
  staffA: "10000000-0000-4000-8000-000000000003",
  removedA: "10000000-0000-4000-8000-000000000004",
  businessA: "20000000-0000-4000-8000-000000000001",
  businessB: "20000000-0000-4000-8000-000000000002",
  serviceA: "30000000-0000-4000-8000-000000000001",
  serviceB: "30000000-0000-4000-8000-000000000002",
  leadA: "40000000-0000-4000-8000-000000000001",
  leadB: "40000000-0000-4000-8000-000000000002",
};

export async function seedDatabase(db: TestDatabase) {
  const f = fixtures;

  for (const userId of [f.ownerA, f.ownerB, f.staffA, f.removedA]) {
    await db.query(
      "insert into auth.users(id,email) values ($1,$2)",
      [userId, `${userId}@codeedge.test`],
    );
  }

  await db.query(
    "insert into public.businesses(id,name,slug,timezone) values ($1,'Business A','business-a','Europe/London'),($2,'Business B','business-b','Asia/Karachi')",
    [f.businessA, f.businessB],
  );

  await db.query(
    `insert into public.business_memberships(business_id,user_id,role,status) values
      ($1,$3,'owner','active'),
      ($2,$4,'owner','active'),
      ($1,$5,'staff','active'),
      ($1,$6,'staff','revoked')`,
    [f.businessA, f.businessB, f.ownerA, f.ownerB, f.staffA, f.removedA],
  );

  await db.query(
    "insert into public.services(id,business_id,name) values ($1,$2,'Boiler repair'),($3,$4,'Electrical repair')",
    [f.serviceA, f.businessA, f.serviceB, f.businessB],
  );

  await db.query(
    `insert into public.leads(
      id,business_id,contact_name,phone,email,source,service_id,enquiry_summary,status,
      estimated_value_pence,last_contact_at,created_by
    ) values
      ($1,$2,'Lead A','111','','google',$3,'Enquiry A','new',48000,now(),$4),
      ($5,$6,'Lead B','','b@example.test','website',$7,'Enquiry B','contacted',32000,now(),$8)`,
    [f.leadA, f.businessA, f.serviceA, f.ownerA, f.leadB, f.businessB, f.serviceB, f.ownerB],
  );
}

export async function asUser(db: TestDatabase, userId: string | null) {
  await db.exec(userId ? "SET LOCAL ROLE authenticated" : "SET LOCAL ROLE anon");
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, true)",
    [userId ?? ""],
  );
}
