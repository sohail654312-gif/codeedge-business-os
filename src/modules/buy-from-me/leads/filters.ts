import type { LeadFilters } from "./validation";

export function hasLeadFilters(filters: LeadFilters) {
  return Boolean(filters.q || filters.status || filters.source || filters.service_id);
}
