import type { LeadSource, LeadStatus } from "./domain";

export type DemoLead = {
  id: string;
  contactName: string;
  phone: string;
  email: string;
  source: LeadSource;
  serviceName: string;
  enquirySummary: string;
  status: LeadStatus;
  estimatedValuePence: number;
  lastContactLabel: string;
};

export const demoLeads: DemoLead[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    contactName: "Sarah Jenkins",
    phone: "07700 900111",
    email: "sarah.jenkins@example.com",
    source: "google",
    serviceName: "Boiler repair",
    enquirySummary: "Boiler is losing pressure and needs an urgent inspection.",
    status: "new",
    estimatedValuePence: 48_000,
    lastContactLabel: "10 min ago",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    contactName: "David Patel",
    phone: "07700 900222",
    email: "david.patel@example.com",
    source: "website",
    serviceName: "Bathroom quote",
    enquirySummary: "Requested a quote for a full bathroom refurbishment and plumbing work.",
    status: "contacted",
    estimatedValuePence: 240_000,
    lastContactLabel: "45 min ago",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    contactName: "Mike Turner",
    phone: "07700 900333",
    email: "mike.turner@example.com",
    source: "voice_ai",
    serviceName: "Emergency plumbing",
    enquirySummary: "AI Voice captured an urgent leaking-pipe enquiry and callback request.",
    status: "qualified",
    estimatedValuePence: 32_000,
    lastContactLabel: "1 hour ago",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    contactName: "Emily Carter",
    phone: "07700 900444",
    email: "emily.carter@example.com",
    source: "whatsapp",
    serviceName: "Heating service",
    enquirySummary: "Asked for availability for an annual heating service next week.",
    status: "contacted",
    estimatedValuePence: 21_000,
    lastContactLabel: "Yesterday",
  },
];

export function getDemoLead(leadId: string) {
  return demoLeads.find((lead) => lead.id === leadId) ?? null;
}

export function formatLeadValue(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}
