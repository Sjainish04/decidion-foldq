import { ArrowRight } from "lucide-react";

const GATES = [
  {
    id: "A",
    name: "Representable",
    question: "Is the reference structure in the candidate set?",
    onFailure: "candidate generation, a hard ceiling no optimizer can lift",
    tone: "--classical",
  },
  {
    id: "B",
    name: "Faithful",
    question: "Is the reference structure the QUBO's ground state?",
    onFailure: "energy model misspecified",
    tone: "--quantum",
  },
  {
    id: "C",
    name: "Solved",
    question: "Did this solver reach the ground state?",
    onFailure: "optimizer",
    tone: "--quantum-inspired",
  },
  {
    id: "D",
    name: "Physical",
    question: "Energy gap and base-pair F1 after decode, repair and rescore",
    onFailure: "the number that matters",
    tone: "--reference",
  },
];

/** The ladder as a left-to-right pipeline: a run passes through the gates in
 *  order, and the first one it fails is the one blamed. */
export function GateLegend() {
  return (
    <section className="panel overflow-hidden p-5 sm:p-6">
      <p className="eyebrow">Method</p>
      <h2 className="section-title mt-1">The four-gate diagnostic ladder</h2>
      <p className="mb-5 mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
        Attribution names the <strong>earliest failing gate</strong>. A later gate is
        never blamed for an earlier failure: if the candidate set never held the answer,
        the optimizer cannot be at fault.
      </p>
      <div className="relative">
        {/* The rail the gates sit on, drawn behind the badges on wide screens. */}
        <span
          aria-hidden="true"
          className="absolute left-[12%] right-[12%] top-6 hidden h-0.5 rounded-full bg-gradient-to-r from-[var(--classical)] via-[var(--quantum)] to-[var(--reference)] opacity-50 lg:block"
        />
        <ul aria-label="Four-gate diagnostic ladder" className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GATES.map((gate, index) => (
            <li
              key={gate.id}
              className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 pt-3 lg:bg-transparent lg:text-center"
            >
              <div className="flex items-center gap-3 lg:flex-col lg:gap-2">
                <span
                  aria-hidden="true"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full font-mono text-lg font-bold text-white shadow-[var(--shadow-md)] ring-4 ring-[var(--surface)]"
                  style={{
                    background: `linear-gradient(145deg, color-mix(in srgb, var(${gate.tone}) 80%, white), var(${gate.tone}))`,
                  }}
                >
                  {gate.id}
                </span>
                <p className="text-sm font-semibold">
                  <span className="mr-1.5 text-[var(--accent-text)] lg:mr-0 lg:block lg:text-xs lg:font-medium">
                    Gate {gate.id}
                  </span>
                  {gate.name}
                </p>
              </div>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">{gate.question}</p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">On failure:</span>{" "}
                {gate.onFailure}
              </p>
              {index < GATES.length - 1 && (
                <ArrowRight
                  aria-hidden="true"
                  size={16}
                  className="absolute -right-3 top-4 z-10 hidden rounded-full bg-[var(--surface)] text-[var(--text-secondary)] lg:block"
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
