const GATES = [
  {
    id: "A",
    name: "Representable",
    question: "Is the reference structure in the candidate set?",
    onFailure: "candidate generation — a hard ceiling no optimizer can lift",
  },
  {
    id: "B",
    name: "Faithful",
    question: "Is the reference structure the QUBO's ground state?",
    onFailure: "energy model misspecified",
  },
  {
    id: "C",
    name: "Solved",
    question: "Did this solver reach the ground state?",
    onFailure: "optimizer",
  },
  {
    id: "D",
    name: "Physical",
    question: "Energy gap and base-pair F1 after decode, repair and rescore",
    onFailure: "the number that matters",
  },
];

export function GateLegend() {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold">The four-gate diagnostic ladder</h2>
      <p className="mb-3 mt-1 text-sm text-[var(--text-secondary)]">
        Attribution names the <strong>earliest failing gate</strong>. A later gate is
        never blamed for an earlier failure — if the candidate set never held the answer,
        the optimizer cannot be at fault.
      </p>
      <ul aria-label="Four-gate diagnostic ladder" className="grid gap-2 sm:grid-cols-2">
        {GATES.map((gate) => (
          <li
            key={gate.id}
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3"
          >
            <p className="text-sm font-medium">
              <span className="mr-2 text-[var(--accent-text)]">Gate {gate.id}</span>
              {gate.name}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{gate.question}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              On failure: {gate.onFailure}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
