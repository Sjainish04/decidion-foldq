"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import "molstar/build/viewer/molstar.css";

import {
  RepresentationPicker,
  type PolymerRepresentationType,
} from "./RepresentationPicker";

// `StructureComponentRef.key` is the sorted, joined set of a component's state-tree
// tags (see mol-plugin-state/manager/structure/hierarchy-state.js#componentKey).
// Mol*'s built-in presets tag static components as `structure-component-static-<type>`
// (mol-plugin-state/builder/structure.js#tryCreateComponentStatic), so these keys are
// how we find "the polymer component" / "the ion component" after applying a preset.
const POLYMER_COMPONENT_KEY = "structure-component-static-polymer";
const ION_COMPONENT_KEY = "structure-component-static-ion";

/** Hand-typed slice of Mol*'s PluginUIContext covering only what this file calls.
 *  Kept separate from `molstar`'s own types so nothing here forces an eager,
 *  module-scope import of the package — see the dynamic imports below. */
interface MolstarComponentRef {
  key?: string;
}
interface MolstarStructureRef {
  components: MolstarComponentRef[];
}
interface MolstarPlugin {
  managers: {
    structure: {
      hierarchy: { current: { structures: MolstarStructureRef[] } };
      component: {
        applyPreset: (
          structures: readonly MolstarStructureRef[],
          provider: unknown,
        ) => Promise<unknown>;
        removeRepresentations: (
          components: readonly MolstarComponentRef[],
        ) => Promise<void> | undefined;
        addRepresentation: (
          components: readonly MolstarComponentRef[],
          type: string,
        ) => Promise<void> | undefined;
      };
    };
  };
}
interface MolstarViewerInstance {
  plugin: MolstarPlugin;
  dispose: () => void;
  loadPdb: (id: string) => Promise<void>;
}

function findComponents(plugin: MolstarPlugin, key: string): MolstarComponentRef[] {
  return plugin.managers.structure.hierarchy.current.structures.flatMap((structure) =>
    structure.components.filter((component) => component.key === key),
  );
}

/** Mol*'s component manager has no single "change representation type" call — the
 *  supported idiom (mol-plugin-ui/structure/components.js's remove/add actions) is to
 *  drop the existing representation(s) and add a new one of the desired type, which
 *  fills in correct defaults for that type via the representation registry. */
async function setComponentRepresentation(
  plugin: MolstarPlugin,
  components: MolstarComponentRef[],
  type: string,
) {
  if (components.length === 0) return;
  await plugin.managers.structure.component.removeRepresentations(components);
  await plugin.managers.structure.component.addRepresentation(components, type);
}

/** Mol* wrapper.
 *
 *  The library is imported inside the effect rather than at module scope so it never
 *  enters the bundle of a route that does not render a structure — it is by a wide
 *  margin the largest dependency in the project.
 *
 *  `loadPdb` alone applies Mol*'s size-based "auto" representation preset, which for
 *  small entries (most FoldQ predictions) collapses everything — polymer, ligands,
 *  ions — into one ball-and-stick component with nothing separable. Right after load
 *  we explicitly re-apply the "polymer-and-ligand" preset instead, which always
 *  produces distinct polymer / ligand / ion (etc.) components; `component.applyPreset`
 *  also deletes whatever component the previous preset created, so this never leaves a
 *  duplicate structure rendered underneath. Ligands and other hetero-atoms keep that
 *  preset's ball-and-stick default; ions are switched to spacefill once, immediately
 *  after — both stay fixed no matter what the user later picks for the polymer.
 */
export function MolstarViewer({
  pdbId,
  height = 480,
}: {
  pdbId: string;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pluginRef = useRef<MolstarPlugin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [representation, setRepresentation] =
    useState<PolymerRepresentationType>("cartoon");
  // Tracks which pdbId the state above belongs to, so a new id can reset it. Done
  // during render rather than in the effect below, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [loadedFor, setLoadedFor] = useState(pdbId);
  if (loadedFor !== pdbId) {
    setLoadedFor(pdbId);
    setError(null);
    setReady(false);
    setRepresentation("cartoon");
  }

  useEffect(() => {
    let cancelled = false;

    async function start(): Promise<MolstarViewerInstance | null> {
      if (!container.current) return null;
      try {
        const { Viewer } = await import("molstar/lib/apps/viewer/app");
        const instance = (await Viewer.create(container.current, {
          layoutIsExpanded: false,
          layoutShowControls: false,
          layoutShowSequence: true,
          layoutShowLog: false,
          viewportShowExpand: true,
          viewportShowSelectionMode: true,
        })) as unknown as MolstarViewerInstance;
        if (cancelled) {
          instance.dispose();
          return null;
        }
        await instance.loadPdb(pdbId);
        if (cancelled) return instance;

        // Passing the preset's registry key rather than an imported provider object
        // avoids a second dynamic import: `StructureRepresentationBuilder.resolveProvider`
        // (mol-plugin-state/builder/structure/representation.js) resolves a string
        // against `PresetStructureRepresentations` itself, and that module is already
        // loaded as an internal dependency of the plugin runtime the `Viewer` import
        // above just created.
        const structures = instance.plugin.managers.structure.hierarchy.current.structures;
        await instance.plugin.managers.structure.component.applyPreset(
          structures,
          "polymer-and-ligand",
        );
        if (cancelled) return instance;

        const ions = findComponents(instance.plugin, ION_COMPONENT_KEY);
        await setComponentRepresentation(instance.plugin, ions, "spacefill");
        if (cancelled) return instance;

        pluginRef.current = instance.plugin;
        setReady(true);
        return instance;
      } catch (cause) {
        if (!cancelled) {
          setError(
            `Could not load ${pdbId} from RCSB: ${(cause as Error).message}`,
          );
        }
        return null;
      }
    }

    // The promise is held, not discarded, so cleanup can dispose through it.
    // Reading a mutable `viewer` variable instead loses the instance whenever
    // teardown lands while `Viewer.create` is still in flight — the common case
    // under StrictMode's double-invoked effects, and a leaked WebGL context is
    // not garbage collected. Chaining off the promise makes disposal ordered
    // after creation rather than racing it.
    const creation = start();
    return () => {
      cancelled = true;
      pluginRef.current = null;
      void creation.then((instance) => instance?.dispose()).catch(() => {});
    };
  }, [pdbId]);

  const handleRepresentationChange = useCallback((next: PolymerRepresentationType) => {
    const plugin = pluginRef.current;
    if (!plugin) return;
    setRepresentation(next);
    void setComponentRepresentation(
      plugin,
      findComponents(plugin, POLYMER_COMPONENT_KEY),
      next,
    );
  }, []);

  return (
    <section aria-label={`3D structure of ${pdbId}`}>
      <div className="mb-2 flex items-center justify-end">
        <RepresentationPicker
          id={`molstar-representation-${pdbId}`}
          value={representation}
          onChange={handleRepresentationChange}
          disabled={!ready}
        />
      </div>
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
          Interactive 3D view of PDB entry {pdbId}. Polymer chains are shown as{" "}
          {representation === "molecular-surface" ? "a molecular surface" : representation},
          hetero-atoms and ligands as sticks, ions as spheres. Rotate by dragging; zoom
          with the scroll wheel.
        </p>
      )}
    </section>
  );
}
