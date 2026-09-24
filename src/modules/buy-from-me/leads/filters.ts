import { z } from "zod";
import { leadSources, leadStatuses } from "./domain";

const optionalUuid = z.union([z.literal(""), z.uuid()]).transform((value) => value || null);
const optionalStatus = z.union([z.literal(""), z.enum(leadStatuses)]).transform((value) => value || null);
const optionalSource = z.union([z.literal(""), z.enum(leadSources)]).transform((value) => value || null);

export const leadFilterSchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: optionalStatus.default(null),
  source: optionalSource.default(null),
  service: optionalUuid.default(null),
});

export type LeadFilters = z.infer<typeof leadFilterSchema>;

export function parseLeadFilters(input: Record<string, string | string[] | undefined>): LeadFilters {
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const parsed = leadFilterSchema.safeParse({
    q: one(input.q),
    status: one(input.status),
    source: one(input.source),
    service: one(input.service),
  });

  if (!parsed.success) {
    return { q: "", status: null, source: null, service: null };
  }
  return parsed.data;
}

export function buildLeadSearchOr(term: string) {
  const clean = term.trim().replace(/[,%()\\]/g, " ").replace(/\s+/g, " ").slice(0, 100);
  if (!clean) return null;
  const pattern = `%${clean.replace(/[%_]/g, "")}%`;
  return [
    `contact_name.ilike.${pattern}`,
    `phone.ilike.${pattern}`,
    `email.ilike.${pattern}`,
    `enquiry_summary.ilike.${pattern}`,
  ].join(",");
}

export function hasLeadFilters(filters: LeadFilters) {
  return Boolean(filters.q || filters.status || filters.source || filters.service);
}
