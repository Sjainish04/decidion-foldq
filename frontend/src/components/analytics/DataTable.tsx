export interface Column {
  key: string;
  label: string;
  format?: (value: never) => string;
}

/** Rows are generic rather than `Record<string, unknown>[]`.
 *
 *  A TypeScript *interface* has no implicit index signature, so a named row type
 *  like `SolverSummaryRow` is not assignable to `Record<string, unknown>` even
 *  though its shape is compatible. Typing `rows` that way forced every caller to
 *  write `as unknown as Record<string, unknown>[]`, which is a double assertion
 *  that switches off checking at each call site — so a genuinely wrong row type
 *  would have passed silently. Widening once, here, keeps the call sites honest.
 */
export interface DataTableProps<Row = unknown> {
  columns: Column[];
  rows: readonly Row[];
  caption: string;
}

export function DataTable<Row>({ columns, rows, caption }: DataTableProps<Row>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label={caption}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-left">
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-3 py-2 font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-[var(--border)]/50">
              {columns.map((column) => {
                const value = (row as Record<string, unknown>)[column.key];
                const rendered =
                  value === null || value === undefined
                    ? "—"
                    : column.format
                      ? column.format(value as never)
                      : String(value);
                return (
                  <td key={column.key} className="px-3 py-1.5 tabular-nums">
                    {rendered}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
