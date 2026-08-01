export function LigandList({ ligands }: { ligands: string[] }) {
  if (ligands.length === 0) {
    return (
      <p className="text-xs text-[var(--text-secondary)]">No bound hetero-atoms.</p>
    );
  }
  return (
    <p className="text-xs text-[var(--text-secondary)]">
      Hetero-atoms:{" "}
      {ligands.map((ligand) => (
        <code key={ligand} className="mr-1 rounded bg-[var(--surface-elevated)] px-1">
          {ligand}
        </code>
      ))}
      <span className="ml-1">— rendered as sticks in the 3D view.</span>
    </p>
  );
}
