# Codeedge Booking / Appointments Core

## Product ownership

Codeedge Booking is a native Business OS capability. The Codeedge appointment row is the source of truth. Google Calendar, Microsoft Calendar, Zoom, communications providers, and future AI tools are optional rails around that record and must never replace the Booking engine.

## Appointment model

Appointments are tenant-owned and support:

- optional Lead
- optional Customer
- optional Service at the database model level
- contact name, email and phone
- UTC-safe start/end timestamps
- captured business IANA timezone
- status
- source
- internal notes
- creator and timestamps

The dashboard Booking flow requires an active Codeedge Service because slot generation needs a deterministic duration.

### Status lifecycle

- pending → confirmed
- pending → cancelled
- confirmed → completed
- confirmed → cancelled
- confirmed → no_show

Completed, cancelled and no-show are terminal in this milestone.

## Services

Booking reuses `public.services`. No booking-specific service catalog exists.

The existing Service model is extended with:

- `duration_minutes` — defaults to 30 for backward compatibility; allowed range 5–480 minutes

Inactive Services cannot be used by the Booking service or database slot guard.

## Opening Hours

Booking reuses `public.opening_hours`.

Current supported availability model remains intentionally simple:

- ISO weekday 1–7
- one same-day opening interval per weekday
- business-level schedule
- no overnight interval
- no holiday/special-hours overrides
- no staff/resource-specific availability

Those limitations are documented instead of creating a second schedule system.

## Timezone model

Opening Hours are wall-clock times in `businesses.timezone`. Appointment timestamps are stored as `timestamptz`.

The server converts business wall-clock slots to UTC using the platform IANA timezone database and verifies the round trip. Nonexistent DST spring-forward wall times are rejected/skipped rather than silently shifted.

Availability and appointment rendering never assume the browser or developer-machine timezone.

## Availability algorithm

For a requested local date:

1. validate the business timezone/date
2. load an active tenant-owned Service
3. read its duration
4. load that ISO weekday's Opening Hours
5. derive UTC bounds for the business-local date
6. load overlapping tenant appointments
7. generate duration-aligned slots inside Opening Hours
8. exclude past slots
9. exclude overlaps with every non-cancelled appointment
10. return canonical UTC slot instants

The create/reschedule service checks the offered slot again immediately before using the database mutation RPC.

## Double-booking / race protection

Browser availability is never authoritative.

The database RPC:

1. verifies live tenant membership
2. takes a PostgreSQL transaction advisory lock keyed by `business_id`
3. re-loads Service/business/Opening Hours state
4. re-checks all non-cancelled appointment overlap
5. only then inserts or reschedules

The lock serializes conflicting Booking mutations for a business across concurrent PostgreSQL transactions. The overlap check uses half-open intervals, so one appointment may begin exactly when another ends.

Cancelled appointments do not block a slot.

## Tenant and authorization model

`appointments` uses forced RLS.

Authenticated browsers have SELECT permission only, under existing owner/staff membership policies. Creation, rescheduling, and lifecycle changes use narrow SECURITY DEFINER RPCs that derive the active user from `auth.uid()` and verify membership server-side.

Same-tenant foreign keys prevent an appointment from linking a different business's:

- Lead
- Customer
- Service

Customer + Lead links must also match the existing Customer source-Lead relationship.

Dashboard server actions derive the business from `requireDashboardTenant()`; form payload business IDs, execution modes, or provider choices are never authoritative.

## CRM integration

Appointments reuse Codeedge CRM identity:

- link a Lead when known
- link a Customer when known
- when a Customer is supplied without a Lead, use that Customer's existing source Lead
- reject inconsistent Customer/Lead combinations
- do not create another contact identity system

Booking activity is appended to the existing CRM activity timeline:

- appointment_created
- appointment_rescheduled
- appointment_confirmed
- appointment_cancelled
- appointment_completed
- appointment_no_show

Lead details also surface linked appointment history. Customer directory rows link to filtered appointment history.

## Internal Codeedge calendar

The first UI is a practical responsive agenda/list rather than an overbuilt resource calendar.

It includes:

- upcoming appointments
- history
- Service
- time and business timezone
- status
- appointment details
- create appointment
- reschedule
- confirm/cancel/complete/no-show actions

## Demo / Sandbox behavior

Internal Booking is not an external effect.

Therefore a Demo workspace can use the real:

- Services
- Opening Hours
- timezone logic
- availability engine
- appointments
- reschedule/cancel/status lifecycle
- CRM activity

without external calendar credentials or WhatsApp/Email/SMS delivery.

The Booking service does not call Meta, Resend, Twilio, Google, Microsoft, Zoom, or another production provider.

## Future calendar provider boundary

A minimal `CalendarProvider` contract reserves the future boundary. It does not have a fake or production implementation yet.

Future flow:

Appointment → Calendar Sync Service → Execution Context → External Effect Policy → Calendar Provider

Future external calendar rules must be:

- Demo → internal calendar only
- Sandbox → explicitly approved sandbox/test provider only
- Production → approved production provider/configuration

Codeedge remains the source of truth.

## AI Voice / AI Employee readiness

Booking operations live in reusable server/domain services, not only UI actions. Future controlled tools can wrap the same rules:

- checkAvailability
- createAppointment
- rescheduleAppointment
- cancelAppointment

AI tools must inherit tenant authorization and execution context; they must not write around Booking rules.

## Reference sources

The protected Codeedge MVP was consulted only for proven Service, Opening Hours, validation, and tenant/RLS conventions. It was not modified.

SimplerDevelopment was consulted as an Apache-2.0 architectural reference for timezone-aware slot calculation, server-side slot revalidation, rescheduling/cancellation concepts, and calendar UX organization. No wholesale booking subsystem or provider/payment integration was copied into Codeedge.

## Deferred

Deliberately deferred from this core milestone:

- public self-service booking page
- holiday/date overrides
- multiple shifts per day
- staff/doctor/room/resource scheduling
- reminders and notification engine
- Google Calendar production sync
- Microsoft Calendar production sync
- Zoom
- payments/refunds/add-ons
- capacity/group booking
- polished Demo Clinic / seeded demo suite
- AI Voice implementation
- Automation Engine
