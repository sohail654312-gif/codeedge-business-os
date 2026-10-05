import { z } from "zod";

export const pageSchema = z.preprocess(
  (value) => Array.isArray(value) ? value[0] : value,
  z.coerce.number().int().min(1).max(10000).catch(1),
);
export function pageHref(path: string, filters: Record<string, string | null>, page: number) {
  const query = new URLSearchParams();
  for (const [key,value] of Object.entries(filters)) if (value) query.set(key,value);
  query.set("page",String(page));
  return `${path}?${query}`;
}
