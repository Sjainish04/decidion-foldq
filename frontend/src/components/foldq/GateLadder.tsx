import { gateLadder, type GateState } from "@/lib/foldq/gates";
import type { GateReport } from "@/lib/api/schemas";

const STATE_LABEL: Record<GateState, string> = {
  pass: "Pass",
  fail: "Fail",
  indeterminate: "Indeterminate",
  "not-applicable": "Not applicable",
};

const STATE_COLOR: Record<GateState, string> = {
  pass: "var(--reference)",
  fail: "var(--danger)",
  indeterminate: "var(--warning)",
  "not-applicable": "var(--text-secondary)",
};

export function GateLadder({ gates }: { gates: GateReport }) {
  const ladder = gateLadder(gates);
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-base font-semibold">Diagnostic ladder</h2>
      <p className="mb-3 mt-1 text-sm">
        <span className="text-[var(--text-secondary)]">Attribution: </span>
        <span className="font-medium">{gates.attribution}</span>
      </p>
      <ol className="space-y-2">
        {ladder.map((gate) => (
          <li
            key={gate.id}
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Gate {gate.id}
              </span>
              <span className="text-sm font-medium">{gate.name}</span>
              <span
                className="rounded border px-1.5 py-0.5 text-[11px] font-medium"
                style={{ color: STATE_COLOR[gate.state], borderColor: STATE_COLOR[gate.state] }}
              >
                {STATE_LABEL[gate.state]}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{gate.question}</p>
            <p className="mt-1 text-xs">{gate.detail}</p>
          </li>
        ))}
      </ol>
      {gates.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[var(--text-secondary)]">
          {gates.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
