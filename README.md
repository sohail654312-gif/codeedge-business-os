# CodeEdge Business OS

**One Business. One Account. One Control Centre.**

This repository is a separate future/backup SaaS concept. It does **not** replace or modify the existing CodeEdge MVP.

## Foundation shell

The first pass contains:

- Public landing page
- Demo sign-in screen
- Client Command Centre
- Six customer-facing areas: Find Me, Contact Me, Buy From Me, Pay Me, Manage Me, Help Me Grow
- CRM-style lead pipeline demo
- AI Voice Agent demo surface
- Finance, operations and insights demo surfaces
- Integration adapter plan for finance, communications, automation, voice and AI
- GitHub Actions build check

## Run locally

1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:3000`.

## Architecture rule

CodeEdge owns the client experience, organisation/workspace identity, permissions, module access and dashboard. Specialist engines are connected through adapters so they can be replaced later without redesigning the platform.

## Status

This is a **sales/demo foundation**, not production accounting, tax, banking, payroll or autonomous AI software.
