"use client";

import { downloadText } from "@/lib/foldq/export";
import { toBpseq, toCt, toDotBracket } from "@/lib/foldq/structure-formats";
import type { FoldResponse } from "@/lib/api/schemas";

/** Download a result in the formats other RNA structure tools read.
 *
 *  This is the honest form of "integrate with XRNA": XRNA-React is a hosted web
 *  application, not a package — there is no npm module to import and no
 *  embeddable component. What it does accept is standard structure files, so the
 *  useful thing to build is the export, not a wrapper around something that
 *  cannot be wrapped. The same files open in RNAcanvas, VARNA and forna, which
 *  makes this worth more than a single-tool integration would have been.
 *
 *  CT and BPSEQ are listed first because they carry pseudoknots; dot-bracket is
 *  offered last and labelled with what it loses.
 */

const TOOLS = [
  {
    name: "XRNA-React",
    href: "https://ldwlab.github.io/XRNA-React/",
    note: "Interactive editor. Load the CT or BPSEQ file to rearrange the layout by hand.",
  },
  {
    name: "RNAcanvas",
    href: "https://rnacanvas.app/",
    note: "Drawing and annotation. Accepts CT and dot-bracket.",
  },
  {
    name: "forna",
    href: "http://rna.tbi.univie.ac.at/forna/",
    note: "Force-directed layouts, the same idea as the interactive drawing above.",
  },
];

export function StructureExport({ result }: { result: FoldResponse }) {
  const stem = `foldq_${result.run_id}`;

  const formats = [
    {
      label: "CT",
      extension: "ct",
      description: "mfold / RNAstructure. Carries pseudoknots.",
      build: () => toCt(result),
    },
    {
      label: "BPSEQ",
      extension: "bpseq",
      description: "RNAcentral / CRW. Carries pseudoknots.",
      build: () => toBpseq(result),
    },
    {
      label: "Dot-bracket",
      extension: "fasta",
      description: result.gates.is_pseudoknotted
        ? "Widest support, but the crossing pairs in this structure may not survive."
        : "Widest support. Cannot express crossing pairs.",
      build: () => toDotBracket(result),
    },
  ];

  return (
    <section className="rounded-lg border border-[var(--border)] p-4">
      <h3 className="text-base font-semibold">Open in another viewer</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Download this structure in a standard format, then load it into any RNA drawing tool.
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {formats.map((format) => (
          <li key={format.extension}>
            <button
              type="button"
              onClick={() =>
                downloadText(`${stem}.${format.extension}`, format.build(), "text/plain")
              }
              className="w-full rounded border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
            >
              <span className="font-medium">{format.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                {format.description}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h4 className="mt-4 text-sm font-semibold">Tools that read these files</h4>
      <ul className="mt-1 space-y-1 text-sm">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <a
              href={tool.href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              {tool.name}
            </a>
            <span className="text-[var(--text-secondary)]"> — {tool.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
