# Codeedge Business OS — V1 feature completeness

This document describes the original Business OS feature-build scope. It is intentionally separate from the four-audit remediation and production-hardening programme.

## V1 feature journeys

- SaaS foundation: authentication, workspaces, memberships, roles, tenant isolation and RLS.
- CRM: Leads, Customers, conversion, activity history, notes and quote requests.
- Business information: profile, Services, service areas, opening hours, FAQs, settings and owner-editable business timezone.
- Communications: Shared Inbox, Website Chat, WhatsApp, Email and SMS.
- Booking: availability and appointment create/confirm/reschedule/cancel flows using the configured business timezone.
- AI Voice / Receptionist: provider-neutral Voice foundation plus a zero-live-telephony Demo flow that links a Lead, Conversation, transcript and Booking.
- Automation: trigger/condition/action engine, owner workflow creation and enable/disable controls, run history, tenant isolation and Demo dry-run behavior.
- Codeedge Money: Finance Engine boundary, Demo Finance, ERPNext adapter, read/report views, standard Demo write UX and explicit unsupported-capability states.
- AI Accountant: grounded Finance context, Demo AI, provider-neutral runtime and human-approved Finance action proposals.
- Command Centre: operational values from real Codeedge CRM, Booking, Shared Inbox, Automation and Money data.
- Demo/Sandbox/Production execution safety and the External Effect Policy remain part of the feature architecture.

## Deliberately outside original V1

Jarvis, generalized AI Sales/Support employees, payroll, Open Banking, payment processing, a full billing platform, arbitrary new integrations, a Codeedge-native production ledger, enterprise workflow scheduling/wait nodes and major product redesign are future phases.

## Separate production-hardening programme

Feature completeness does not mean production-readiness completeness. Security dependency remediation, hosted-schema parity, backup/restore, observability, release/rollback governance, provider hardening, pooling, retention, branch protection and other findings from the four audits belong to the Master Audit Remediation & Hardening Program.
