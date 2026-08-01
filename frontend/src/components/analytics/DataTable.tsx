export interface Column {
  key: string;
  label: string;
  format?: (value: never) => string;
}

export interface DataTableProps {
  columns: Column[];
  rows: Record<string, unknown>[];
  caption: string;
}

export function DataTable({ columns, rows, caption }: DataTableProps) {
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
                const value = row[column.key];
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
