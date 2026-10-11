import { FileText, Table2 } from "lucide-react";
import { DataTable, type DataTableProps } from "./DataTable";

const REPO_BLOB = "https://github.com/Sjainish04/decidion-foldq/blob/main/";

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
    <section className="panel p-5 sm:p-6">
      <Heading className="section-title">{title}</Heading>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">{description}</p>
      <div className="figure-plate px-2 pb-1 pt-3 sm:px-3">{children}</div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs text-[var(--text-secondary)]">
          Source:{" "}
          <a
            href={`${REPO_BLOB}${source}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)]/60 px-2 py-0.5 align-middle transition-colors hover:border-[var(--quantum-inspired)] hover:text-[var(--text-primary)]"
          >
            <FileText size={11} aria-hidden="true" />
            <code>{source}</code>
          </a>
        </p>
      </div>
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
        <details className="group mt-3" aria-label={`${title}: view as table`}>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--quantum-inspired)] hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
            <Table2 size={13} aria-hidden="true" />
            <span className="group-open:hidden">View as table</span>
            <span className="hidden group-open:inline">Hide table</span>
          </summary>
          <div className="mt-3">
            <DataTable {...table} />
          </div>
        </details>
      )}
    </section>
  );
}
