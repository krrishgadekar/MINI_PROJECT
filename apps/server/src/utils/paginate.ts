export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
}

export function parsePaginationParams(
  query: Record<string, any>,
  defaultSort: Record<string, 1 | -1> = { createdAt: -1 },
): PaginationOptions {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const rawLimit = parseInt(query.limit as string, 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;

  let sort = defaultSort;
  if (query.sort && typeof query.sort === 'string') {
    const sortField = query.sort.trim();
    if (sortField.startsWith('-')) {
      sort = { [sortField.substring(1)]: -1 };
    } else if (sortField.includes(':')) {
      const [field, dir] = sortField.split(':');
      sort = { [field]: dir.toLowerCase() === 'asc' ? 1 : -1 };
    } else {
      sort = { [sortField]: 1 };
    }
  }

  return { page, limit, skip, sort };
}
