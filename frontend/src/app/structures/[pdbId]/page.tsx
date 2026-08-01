"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { StructureCard } from "@/components/molecular/StructureCard";
import { fetchStructure } from "@/lib/structures/client";
import { useWorkspace } from "@/stores/workspace";

const MolstarViewer = dynamic(
  () => import("@/components/molecular/MolstarViewer").then((m) => m.MolstarViewer),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="flex h-[480px] items-center justify-center rounded-lg border border-[var(--border)] bg-black text-sm text-[var(--text-secondary)]"
      >
        Loading the 3D viewer…
      </div>
    ),
  },
);

export default function StructureDetailPage() {
  const { pdbId } = useParams<{ pdbId: string }>();
  const router = useRouter();
  const setSequence = useWorkspace((state) => state.setSequence);

  const { data, isLoading, error } = useQuery({
    queryKey: ["structure", pdbId],
    queryFn: () => fetchStructure(pdbId),
  });

  if (isLoading) return <p role="status">Loading {pdbId}…</p>;
  if (error) return <p role="alert">{(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{data.pdb_id}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-secondary)]">
            {data.title}
          </p>
        </div>
        <a
          href={`https://www.rcsb.org/structure/${data.pdb_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-[var(--border)] px-3 py-1.5 text-sm"
        >
          View on RCSB ↗
        </a>
      </header>

      <MolstarViewer pdbId={data.pdb_id} />

      <StructureCard
        structure={data}
        onFold={(sequence) => {
          setSequence(sequence);
          router.push("/foldq/new");
        }}
      />

      {data.rna_sequence && (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-base font-semibold">RNA entity sequence</h2>
          <p className="mb-2 mt-1 text-xs text-[var(--text-secondary)]">
            {data.rna_length} nt, as deposited. This is the sequence FoldQ folds — the
            structure above is the experimental answer to compare a prediction against.
          </p>
          <pre className="overflow-x-auto rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
            <code className="font-mono text-xs">{data.rna_sequence}</code>
          </pre>
        </section>
      )}
    </div>
  );
}
