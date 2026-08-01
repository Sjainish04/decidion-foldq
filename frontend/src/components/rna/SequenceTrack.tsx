export function SequenceTrack({
  sequence,
  structure,
}: {
  sequence: string;
  structure: string;
}) {
  return (
    <div className="overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
      <pre className="m-0 whitespace-pre font-mono text-xs leading-5">
        <code aria-label="Sequence">{sequence}</code>
        {"\n"}
        <code aria-label="Structure in dot-bracket notation">{structure}</code>
      </pre>
    </div>
  );
}
