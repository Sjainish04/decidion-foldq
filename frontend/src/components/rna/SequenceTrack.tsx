const BASE_COLORS: Record<string, string> = {
  A: "var(--rna-a)",
  U: "var(--rna-u)",
  C: "var(--rna-c)",
  G: "var(--rna-g)",
};

/** Sequence over structure, column-aligned, with a position ruler every ten
 *  bases and a colour tick per nucleotide. The letters stay in the text colour:
 *  several nucleotide hues are too light to carry small text, so colour only
 *  marks the base, it never is the base. */
export function SequenceTrack({
  sequence,
  structure,
}: {
  sequence: string;
  structure: string;
}) {
  const ruler = Array.from({ length: Math.floor(sequence.length / 10) }, (_, i) =>
    String((i + 1) * 10).padStart(10, " "),
  ).join("");

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
      <pre className="m-0 whitespace-pre font-mono text-xs leading-5">
        <span aria-hidden="true" className="block text-[10px] text-[var(--text-secondary)]">
          {ruler || " "}
        </span>
        <span aria-hidden="true" className="block h-1.5 leading-none">
          {[...sequence].map((base, index) => (
            <span
              key={index}
              className="inline-block h-1 w-[1ch] align-top"
              style={{ background: BASE_COLORS[base] ?? "var(--border)" }}
            />
          ))}
        </span>
        <code aria-label="Sequence" className="block tracking-normal">
          {sequence}
        </code>
        <code
          aria-label="Structure in dot-bracket notation"
          className="block text-[var(--accent-text)]"
        >
          {structure}
        </code>
      </pre>
    </div>
  );
}
