export const leadStatuses = ["new", "contacted", "qualified", "won", "lost"] as const;
export const leadSources = [
  "manual",
  "google",
  "website",
  "website_chat",
  "whatsapp",
  "phone",
  "voice_ai",
  "email",
  "referral",
  "other",
] as const;
export const quoteRequestStatuses = ["requested", "reviewing", "quoted", "declined"] as const;

export type LeadStatus = (typeof leadStatuses)[number];
export type LeadSource = (typeof leadSources)[number];
export type QuoteRequestStatus = (typeof quoteRequestStatuses)[number];

export type LeadRecord = {
  id: string;
  businessId: string;
  contactName: string;
  phone: string;
  email: string;
  source: LeadSource;
  serviceId: string | null;
  enquirySummary: string;
  status: LeadStatus;
  estimatedValuePence: number | null;
  lastContactAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadNoteRecord = {
  id: string;
  businessId: string;
  leadId: string;
  body: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteRequestRecord = {
  id: string;
  businessId: string;
  leadId: string;
  details: string;
  status: QuoteRequestStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

export const leadSourceLabels: Record<LeadSource, string> = {
  manual: "Manual",
  google: "Google",
  website: "Website",
  website_chat: "Website Chat",
  whatsapp: "WhatsApp",
  phone: "Phone",
  voice_ai: "AI Voice",
  email: "Email",
  referral: "Referral",
  other: "Other",
};


export const quoteRequestStatusLabels: Record<QuoteRequestStatus, string> = {
  requested: "Requested",
  reviewing: "Reviewing",
  quoted: "Quoted",
  declined: "Declined",
};
