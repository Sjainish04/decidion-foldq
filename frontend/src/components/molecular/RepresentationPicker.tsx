"use client";

/** The polymer representation types Mol*'s `StructureRepresentationRegistry.BuiltIn`
 *  registers under these exact keys (verified in
 *  node_modules/molstar/lib/mol-repr/structure/registry.js). `MolstarViewer` passes
 *  the value straight through to `component.addRepresentation(components, type)`. */
export type PolymerRepresentationType =
  | "cartoon"
  | "ball-and-stick"
  | "spacefill"
  | "molecular-surface";

const OPTIONS: { value: PolymerRepresentationType; label: string }[] = [
  { value: "cartoon", label: "Cartoon" },
  { value: "ball-and-stick", label: "Ball-and-stick" },
  { value: "spacefill", label: "Spacefill" },
  { value: "molecular-surface", label: "Molecular surface" },
];

/** A labelled, keyboard-reachable control for switching how the polymer chain is
 *  drawn. Ligands, hetero-atoms and ions keep their own fixed representations in
 *  MolstarViewer regardless of what is selected here. */
export function RepresentationPicker({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: PolymerRepresentationType;
  onChange: (value: PolymerRepresentationType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-medium text-[var(--text-secondary)]">
        Polymer representation
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as PolymerRepresentationType)}
        className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs text-[var(--text-primary)] disabled:opacity-60"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
