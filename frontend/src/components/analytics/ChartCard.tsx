import { DataTable, type DataTableProps } from "./DataTable";

export interface ChartCardProps {
  title: string;
  description: string;
  /** The committed file this chart's numbers come from. Rendered verbatim so a
   *  reader can check any figure against the repository. */
  source: string;
  headingLevel?: 2 | 3;
  table?: DataTableProps;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  source,
  headingLevel = 2,
  table,
  children,
}: ChartCardProps) {
  const Heading = (headingLevel === 3 ? "h3" : "h2") as "h2" | "h3";
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <Heading className="text-base font-semibold">{title}</Heading>
      <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      {children}
      <p className="mt-3 text-xs text-[var(--text-secondary)]">
        Source: <code>{source}</code>
      </p>
      {table && (
        // The "group" role that <details> maps to takes no accessible name from
        // its <summary> text, so without an explicit one the disclosure reaches
        // assistive tech unnamed. Naming it after the chart also distinguishes the
        // several disclosures a page carries, which a bare "view as table" would not.
        //
        // aria-label rather than useId + aria-labelledby on purpose: a hook would
        // force this into a client component, and the analytics pages pass column
        // `format` callbacks through the `table` prop -- functions cannot cross the
        // server/client boundary, so that would fail at build time, not here.
        <details className="mt-2" aria-label={`${title} — view as table`}>
          <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
            View as table
          </summary>
          <div className="mt-2">
            <DataTable {...table} />
          </div>
        </details>
      )}
    </section>
  );
}
