import { CircleCheck, CircleHelp, CircleMinus, CircleX, type LucideIcon } from "lucide-react";
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

const STATE_ICON: Record<GateState, LucideIcon> = {
  pass: CircleCheck,
  fail: CircleX,
  indeterminate: CircleHelp,
  "not-applicable": CircleMinus,
};

/** The run's four gates as a vertical stepper: the rail and icon colour show
 *  the state at a glance, and the state is always written out beside them. */
export function GateLadder({ gates }: { gates: GateReport }) {
  const ladder = gateLadder(gates);
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="section-title">Diagnostic ladder</h2>
      <p className="mb-4 mt-1 text-sm">
        <span className="text-[var(--text-secondary)]">Attribution: </span>
        <span className="font-medium">{gates.attribution}</span>
      </p>
      <ol className="relative space-y-3">
        {ladder.map((gate, index) => {
          const Icon = STATE_ICON[gate.state];
          const color = STATE_COLOR[gate.state];
          return (
            <li key={gate.id} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 bg-[var(--surface)]"
                  style={{ borderColor: color, color }}
                >
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                {index < ladder.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="mt-1 w-0.5 flex-1 rounded-full"
                    style={{ background: `linear-gradient(${color}, var(--border))` }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">
                    Gate {gate.id}
                  </span>
                  <span className="text-sm font-semibold">{gate.name}</span>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color, borderColor: color }}
                  >
                    {STATE_LABEL[gate.state]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{gate.question}</p>
                <p className="mt-1 text-xs">{gate.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {gates.notes.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-[var(--text-secondary)]">
          {gates.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
