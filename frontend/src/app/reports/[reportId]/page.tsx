"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DecisionCardFrame } from "@/components/foldq/DecisionCardFrame";
import { foldResponseSchema, type FoldResponse } from "@/lib/api/schemas";
import { CSV_HEADER, downloadText, runToCsvRow } from "@/lib/foldq/export";

function cached(runId: string): FoldResponse | null {
  const raw =
    typeof window === "undefined" ? null : sessionStorage.getItem(`foldq:run:${runId}`);
  if (!raw) return null;
  const parsed = foldResponseSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export default function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  // sessionStorage is read after mount, not during render.
  //
  // Reading it in the component body meant the server render — where there is no
  // sessionStorage — always took the "not in this browser session" branch, and the
  // client had no reliable chance to replace that markup. The card was reachable
  // by its own component test but not through an actual navigation.
  //
  // `undefined` is the third state and is load-bearing: it lets the server and the
  // first client render agree on "still loading", so the alert only ever appears
  // once we have genuinely looked and found nothing.
  const [result, setResult] = useState<FoldResponse | null | undefined>(undefined);
  useEffect(() => setResult(cached(reportId)), [reportId]);

  if (result === undefined) {
    return (
      <p role="status" className="text-sm text-[var(--text-secondary)]">
        Loading report…
      </p>
    );
  }

  if (!result) {
    return (
      <p role="alert" className="text-sm">
        This report is not in this browser session. Fold the sequence again to regenerate
        it — the result is fully determined by the sequence, solver and seed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Decision card</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Self-contained HTML — no external requests, no scripts, no network access.
            Open it anywhere, including offline.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              downloadText(
                `foldq-${result.run_id}.html`,
                result.decision_card_html,
                "text/html",
              )
            }
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Download HTML
          </button>
          <button
            onClick={() =>
              downloadText(
                `foldq-${result.run_id}.csv`,
                `${CSV_HEADER}\n${runToCsvRow(result)}\n`,
                "text/csv",
              )
            }
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Download CSV
          </button>
        </div>
      </header>
      <DecisionCardFrame html={result.decision_card_html} />
    </div>
  );
}
