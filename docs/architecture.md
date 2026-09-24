# Architecture

## Core rule

CodeEdge owns the customer experience and business workspace. External engines remain replaceable.

```text
CodeEdge UI
   |
CodeEdge Application
   |-- CodeEdge data
   |-- Finance adapter
   |-- Communications adapter
   |-- Automation adapter
   |-- Voice adapter
   '-- AI adapter
```

## Customer-facing model

- Find Me
- Contact Me
- Buy From Me
- Pay Me
- Manage Me
- Help Me Grow

## Multi-tenancy direction

Every future business record must be associated with an organisation/workspace. Server-side tenant checks are required before production use.
