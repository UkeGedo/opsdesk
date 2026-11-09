import { like, sql } from 'drizzle-orm';
import type { Paginated } from '@opsdesk/shared/contracts';
export const escaped = (v: string) => `%${v.replace(/[!%_]/g, '!$&')}%`;
export const matching = (col: Parameters<typeof like>[0], q: string) =>
  sql`${col} like ${escaped(q)} escape '!'`;
export const page = (v: { page: number; limit: number }) => ({
  limit: v.limit,
  offset: (v.page - 1) * v.limit,
});
export const result = <T>(
  data: T[],
  total: number,
  v: { page: number; limit: number },
): Paginated<T> => ({
  data,
  meta: { page: v.page, limit: v.limit, total },
});
