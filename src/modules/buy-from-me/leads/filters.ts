import type { LeadFilters } from "./validation";

export function buildLeadSearchOr(term: string) {
  const clean = term.trim().replace(/[,%()\\]/g, " ").replace(/\s+/g, " ").slice(0, 120);
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
  return Boolean(filters.q || filters.status || filters.source || filters.service_id);
}
