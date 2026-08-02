"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GateLadder } from "@/components/foldq/GateLadder";
import { RunSummary } from "@/components/foldq/RunSummary";
import { StageTimeline } from "@/components/foldq/StageTimeline";
import { StructureComparison } from "@/components/foldq/StructureComparison";
import { foldSequence } from "@/lib/api/client";
import { foldResponseSchema, type FoldResponse } from "@/lib/api/schemas";
import { useWorkspace } from "@/stores/workspace";

function cached(runId: string): FoldResponse | null {
  const raw = typeof window === "undefined" ? null : sessionStorage.getItem(`foldq:run:${runId}`);
  if (!raw) return null;
  const parsed = foldResponseSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const workspace = useWorkspace();

  // Read the session cache after mount, never during render. There is no
  // sessionStorage on the server, so reading it in the component body reports a
  // miss on every server render — which here meant re-folding through the API on
  // every navigation to a run we already had, and failing outright with the API
  // down. `undefined` distinguishes "not looked yet" from "looked and found none".
  const [initial, setInitial] = useState<FoldResponse | null | undefined>(undefined);
  useEffect(() => setInitial(cached(runId)), [runId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["run", runId],
    // A run identifier is a content hash, so a genuine cache miss re-folds the same
    // inputs and yields the same result — no persistence layer required.
    queryFn: () =>
      foldSequence({
        sequence: workspace.sequence,
        solver: workspace.solver,
        seed: workspace.seed,
        pseudoknots: workspace.pseudoknots,
      }),
    initialData: initial ?? undefined,
    enabled: initial === null,
  });

  if (initial === undefined) return <p role="status">Loading run…</p>;
  if (isLoading) return <p role="status">Loading run…</p>;
  if (error) return <p role="alert">{(error as Error).message}</p>;
  if (!data) return <p role="alert">This run is not available. Fold the sequence again.</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Run results</h1>
        <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
          {data.sequence}
        </p>
      </header>
      <Link
        href={`/reports/${data.run_id}`}
        className="inline-block rounded border border-[var(--border)] px-3 py-1.5 text-sm"
      >
        Open decision card
      </Link>
      <RunSummary result={data} />
      <StructureComparison result={data} />
      <GateLadder gates={data.gates} />
      <StageTimeline result={data} />
    </div>
  );
}
