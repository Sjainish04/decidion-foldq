"use client";

import { useEffect, useRef, useState } from "react";

import "molstar/build/viewer/molstar.css";

/** Mol* wrapper.
 *
 *  The library is imported inside the effect rather than at module scope so it never
 *  enters the bundle of a route that does not render a structure — it is by a wide
 *  margin the largest dependency in the project.
 *
 *  Ligands and hetero-atoms render as sticks and ions as spheres, which is Mol*'s
 *  default preset for polymer entries. The preset is set explicitly rather than
 *  relied upon.
 */
export function MolstarViewer({
  pdbId,
  height = 480,
}: {
  pdbId: string;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viewer: { dispose: () => void; loadPdb: (id: string) => Promise<void> } | null =
      null;
    let cancelled = false;

    async function start() {
      if (!container.current) return;
      try {
        const { Viewer } = await import("molstar/lib/apps/viewer/app");
        const instance = await Viewer.create(container.current, {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowSequence: true,
          layoutShowLog: false,
          viewportShowExpand: true,
          viewportShowSelectionMode: true,
        });
        if (cancelled) {
          instance.dispose();
          return;
        }
        viewer = instance;
        await instance.loadPdb(pdbId);
      } catch (cause) {
        if (!cancelled) {
          setError(
            `Could not load ${pdbId} from RCSB: ${(cause as Error).message}`,
          );
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      viewer?.dispose();
    };
  }, [pdbId]);

  return (
    <section aria-label={`3D structure of ${pdbId}`}>
      <div
        ref={container}
        style={{ height }}
        className="relative w-full overflow-hidden rounded-lg border border-[var(--border)] bg-black"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          Interactive 3D view of PDB entry {pdbId}. Polymer chains are shown as cartoon,
          hetero-atoms and ligands as sticks, ions as spheres. Rotate by dragging; zoom
          with the scroll wheel.
        </p>
      )}
    </section>
  );
}
