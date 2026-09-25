import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  fixtures as f,
  openDatabase,
  seedDatabase,
  type TestDatabase,
} from "../helpers/database";

const customerA = "50000000-0000-4000-8000-000000000101";
const customerB = "50000000-0000-4000-8000-000000000102";

async function createAppointment(
  db: TestDatabase,
  userId: string,
  input: {
    businessId?: string;
    serviceId?: string;
    leadId?: string | null;
    customerId?: string | null;
    start?: string;
    name?: string;
  } = {},
) {
  await db.exec("RESET ROLE");
  await asUser(db, userId);
  const start = input.start ?? "2030-01-07T09:00:00Z";
  const end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();

  return db.query<{ id: string }>(
    `select public.create_appointment(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
    ) as id`,
    [
      input.businessId ?? f.businessA,
      input.leadId === undefined ? f.leadA : input.leadId,
      input.customerId === undefined ? customerA : input.customerId,
      input.serviceId ?? f.serviceA,
      input.name ?? "Booking Contact",
      "booking@example.test",
      "+447700900123",
      start,
      end,
      "staff",
      "Internal booking test",
    ],
  );
}

describe("Booking tenant security and appointment integration", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await openDatabase();
    await seedDatabase(db);

    await db.query(
      "update public.services set duration_minutes=30 where id in ($1,$2)",
      [f.serviceA, f.serviceB],
    );

    await db.query(
      `insert into public.opening_hours(
        business_id,weekday,is_closed,opens_at,closes_at
      ) values
        ($1,1,false,'09:00','17:00'),
        ($2,1,false,'09:00','17:00')`,
      [f.businessA, f.businessB],
    );

    await db.query(
      `insert into public.customers(
        id,business_id,contact_name,phone,email,source_lead_id,
        erpnext_customer_id,erpnext_sync_status,created_by
      ) values
        ($1,$2,'Customer A','+447700900123','a@booking.test',$3,null,'pending',$4),
        ($5,$6,'Customer B','+447700900124','b@booking.test',$7,null,'pending',$8)`,
      [
        customerA, f.businessA, f.leadA, f.ownerA,
        customerB, f.businessB, f.leadB, f.ownerB,
      ],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("SAVEPOINT booking_security_case");
  });

  afterEach(async () => {
    await db.exec("ROLLBACK TO SAVEPOINT booking_security_case; RELEASE SAVEPOINT booking_security_case");
  });

  it("creates a tenant-owned appointment through the server-authorized RPC", async () => {
    const created = await createAppointment(db, f.staffA);
    expect(created.rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);

    const rows = await db.query<{
      business_id: string;
      lead_id: string;
      customer_id: string;
      service_id: string;
      timezone: string;
      status: string;
      source: string;
    }>(
      "select business_id,lead_id,customer_id,service_id,timezone,status,source from public.appointments",
    );

    expect(rows.rows).toEqual([{
      business_id: f.businessA,
      lead_id: f.leadA,
      customer_id: customerA,
      service_id: f.serviceA,
      timezone: "Europe/London",
      status: "pending",
      source: "staff",
    }]);
  });

  it("prevents staff from creating appointments for another tenant", async () => {
    await expect(createAppointment(db, f.staffA, {
      businessId: f.businessB,
      serviceId: f.serviceB,
      leadId: f.leadB,
      customerId: customerB,
    })).rejects.toThrow(/Booking unavailable/);
  });

  it("rejects forged cross-tenant Service, Lead and Customer relationships", async () => {
    await expect(createAppointment(db, f.staffA, {
      serviceId: f.serviceB,
    })).rejects.toThrow(/Service unavailable/);

    await db.exec("ROLLBACK TO SAVEPOINT booking_security_case; SAVEPOINT booking_security_case");
    await expect(createAppointment(db, f.staffA, {
      leadId: f.leadB,
      customerId: null,
    })).rejects.toThrow(/Lead unavailable/);

    await db.exec("ROLLBACK TO SAVEPOINT booking_security_case; SAVEPOINT booking_security_case");
    await expect(createAppointment(db, f.staffA, {
      customerId: customerB,
    })).rejects.toThrow(/Customer unavailable/);
  });

  it("rejects revoked staff and direct browser writes", async () => {
    await expect(createAppointment(db, f.removedA)).rejects.toThrow(/Booking unavailable/);

    await db.exec("ROLLBACK TO SAVEPOINT booking_security_case; SAVEPOINT booking_security_case");
    await asUser(db, f.staffA);
    await expect(db.query(
      `insert into public.appointments(
        business_id,contact_name,contact_email,contact_phone,
        starts_at,ends_at,timezone,status,source,notes,created_by
      ) values ($1,'Forged','forged@test.dev','+447700900999',
        '2030-01-07T09:00:00Z','2030-01-07T09:30:00Z',
        'Europe/London','pending','staff','',$2)`,
      [f.businessA, f.staffA],
    )).rejects.toThrow(/permission denied/);
  });

  it("isolates appointment reads between tenants", async () => {
    await createAppointment(db, f.staffA, { start: "2030-01-07T09:00:00Z", name: "Tenant A" });
    await db.exec("RESET ROLE");
    await createAppointment(db, f.ownerB, {
      businessId: f.businessB,
      serviceId: f.serviceB,
      leadId: f.leadB,
      customerId: customerB,
      start: "2030-01-07T10:00:00Z",
      name: "Tenant B",
    });

    await db.exec("RESET ROLE");
    await asUser(db, f.staffA);
    expect((await db.query<{ contact_name: string }>(
      "select contact_name from public.appointments order by contact_name",
    )).rows).toEqual([{ contact_name: "Tenant A" }]);
  });

  it("prevents conflicting appointments and allows a cancelled slot to be reused", async () => {
    const first = await createAppointment(db, f.staffA, {
      start: "2030-01-07T11:00:00Z",
      name: "First",
    });

    await expect(createAppointment(db, f.staffA, {
      leadId: null,
      customerId: null,
      start: "2030-01-07T11:00:00Z",
      name: "Conflict",
    })).rejects.toThrow(/no longer available/);

    await db.exec("ROLLBACK TO SAVEPOINT booking_security_case; SAVEPOINT booking_security_case");
    const cancelled = await createAppointment(db, f.staffA, {
      start: "2030-01-07T12:00:00Z",
      name: "Cancelled",
    });

    await db.query(
      "select public.set_appointment_status($1,'cancelled')",
      [cancelled.rows[0]!.id],
    );

    await expect(createAppointment(db, f.staffA, {
      leadId: null,
      customerId: null,
      start: "2030-01-07T12:00:00Z",
      name: "Replacement",
    })).resolves.toHaveProperty("rows");

    expect(first.rows[0]?.id).toBeTruthy();
  });

  it("records appointment lifecycle in the existing CRM activity timeline", async () => {
    const created = await createAppointment(db, f.staffA, {
      start: "2030-01-07T13:00:00Z",
    });
    const id = created.rows[0]!.id;

    await db.query(
      "select public.reschedule_appointment($1,$2,$3)",
      [id, "2030-01-07T14:00:00Z", "2030-01-07T14:30:00Z"],
    );
    await db.query("select public.set_appointment_status($1,'confirmed')", [id]);
    await db.query("select public.set_appointment_status($1,'cancelled')", [id]);

    expect((await db.query<{ event_type: string }>(
      `select event_type::text as event_type
       from public.crm_activities
       where lead_id=$1 and event_type::text like 'appointment_%'
       order by created_at,id`,
      [f.leadA],
    )).rows.map((row) => row.event_type)).toEqual([
      "appointment_created",
      "appointment_rescheduled",
      "appointment_confirmed",
      "appointment_cancelled",
    ]);
  });

  it("allows Demo workspaces to use internal Booking without external effects", async () => {
    await db.exec("RESET ROLE");
    await db.query(
      "update public.businesses set execution_mode='demo' where id=$1",
      [f.businessA],
    );

    const created = await createAppointment(db, f.staffA, {
      start: "2030-01-07T15:00:00Z",
      name: "Demo Appointment",
    });
    expect(created.rows[0]?.id).toBeTruthy();

    await db.exec("RESET ROLE");
    expect((await db.query<{ count: number }>(
      "select count(*)::int as count from public.message_deliveries where business_id=$1",
      [f.businessA],
    )).rows).toEqual([{ count: 0 }]);
  });

  it("rejects forged appointment IDs across tenants", async () => {
    const foreign = await createAppointment(db, f.ownerB, {
      businessId: f.businessB,
      serviceId: f.serviceB,
      leadId: f.leadB,
      customerId: customerB,
      start: "2030-01-07T16:00:00Z",
    });

    await db.exec("RESET ROLE");
    await asUser(db, f.staffA);
    await expect(db.query(
      "select public.set_appointment_status($1,'confirmed')",
      [foreign.rows[0]!.id],
    )).rejects.toThrow(/Appointment unavailable/);
  });

  it("forces RLS on appointments", async () => {
    expect((await db.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relrowsecurity,relforcerowsecurity
       from pg_class
       join pg_namespace n on n.oid=relnamespace
       where n.nspname='public' and relname='appointments'`,
    )).rows).toEqual([{
      relrowsecurity: true,
      relforcerowsecurity: true,
    }]);
  });
});
