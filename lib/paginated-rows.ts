export class PaginatedRowLimitError extends Error {
  readonly maxRows: number;

  constructor(maxRows: number) {
    super(`The result exceeds the supported ${maxRows} rows and cannot be shown or exported without truncation.`);
    this.name = "PaginatedRowLimitError";
    this.maxRows = maxRows;
  }
}

export async function collectPaginatedRows<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  options: { pageSize: number; maxRows: number },
): Promise<T[]> {
  const { pageSize, maxRows } = options;
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxRows) || maxRows < pageSize || maxRows % pageSize !== 0) {
    throw new Error("Pagination limits must be positive, and maxRows must be a multiple of pageSize.");
  }

  const rows: T[] = [];
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    if (page.length > pageSize) throw new Error("The data source returned more rows than requested.");
    if (offset === maxRows && page.length > 0) throw new PaginatedRowLimitError(maxRows);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  return rows;
}
