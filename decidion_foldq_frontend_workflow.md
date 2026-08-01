# Decidion FoldQ Frontend Workflow and Product Architecture

## A High-Impact Scientific Interface for RNA Folding, Quantum Optimization, RWE Structural Evidence, and Interactive Molecular Visualization

> This document specifies the complete frontend product experience for Decidion FoldQ. It assumes the backend, scientific pipeline, authentication, experiment orchestration, and data persistence layers are already implemented.

---

## 1. Product Vision

Decidion FoldQ should feel like a scientific command center rather than a conventional dashboard.

A user should be able to:

1. Enter or select an RNA sequence.
2. Configure a FoldQ experiment.
3. Watch the analysis move through meaningful scientific stages.
4. Inspect candidate folds in synchronized 2D and 3D views.
5. Compare ViennaRNA, QUBO, annealing, and QAOA outputs.
6. Understand why one structure ranked above another.
7. Explore energy landscapes, solver statistics, and quantum-resource requirements.
8. Move from an RWE record to a material or intervention, then to a molecular target.
9. Retrieve real RCSB PDB structures for that target, ranked best resolution first.
10. Render the selected protein or RNA structure in 3D.
11. Display ligands and hetero-atoms as sticks, metal ions as spheres, and polymers as cartoons.
12. Link RNA 2D positions, PDB residues, ligands, solver outputs, and statistical evidence.
13. Export a reproducible, publication-quality decision card.

The interface should make complex computational biology understandable without oversimplifying it.

---

## 2. Core Experience Principles

### 2.1 Scientific evidence first

Every major output must answer:

- What was computed?
- Which data source was used?
- Which assumptions were applied?
- How confident is the result?
- How does it compare with the classical benchmark?
- What failed or required repair?
- Which structure or result is recommended, and why?

### 2.2 Progressive disclosure

New users should see concise summaries first.

Expert users should be able to inspect:

- raw QUBO coefficients;
- Hamiltonian terms;
- base-pair lists;
- solver samples;
- PDB metadata;
- chain coverage;
- ligand details;
- circuit metrics;
- experiment manifests;
- structure-ranking criteria.

### 2.3 Explainability at every layer

No ranked result should appear without a visible reason.

Examples:

- “Selected because it has the best available experimental resolution.”
- “Ranked second because coverage is higher, but resolution is lower.”
- “Fold repaired because nucleotide 18 was paired twice.”
- “QAOA candidate has a lower QUBO energy but a higher ViennaRNA free energy.”
- “No exact experimental RNA structure was found; showing the closest sequence match.”

### 2.4 Reproducibility by default

Each analysis view should expose:

- run identifier;
- Git commit or backend model version;
- sequence checksum;
- solver configuration;
- random seed;
- source databases;
- timestamp;
- exportable manifest.

---

## 3. Product Areas

The frontend is divided into six major product areas.

1. Command Center
   - project overview;
   - active and completed analyses;
   - high-level statistics;
   - system status.

2. FoldQ Studio
   - sequence input;
   - experiment configuration;
   - live run progress;
   - result exploration;
   - solver comparison.

3. Structural Evidence Atlas
   - RWE to material to target navigation;
   - RCSB PDB discovery;
   - protein and RNA 3D structures;
   - ligand and hetero-atom inspection.

4. Analytics Lab
   - solver performance;
   - energy landscapes;
   - structural accuracy;
   - scaling;
   - uncertainty;
   - quantum-resource analysis.

5. Evidence Library
   - saved RWE records;
   - materials;
   - targets;
   - PDB structures;
   - RNA sequences;
   - experiments;
   - decision cards.

6. Reports and Exports
   - publication figures;
   - HTML decision cards;
   - CSV and JSON;
   - molecular scenes;
   - backend-generated PDF reports.

---

## 4. Recommended Frontend Technology Stack

Exact versions should be locked in the repository.

### 4.1 Application framework

- Next.js with App Router
- React
- TypeScript
- Server Components for metadata-heavy pages
- Client Components only where interaction or WebGL is required
- Route-level loading and error boundaries

### 4.2 Styling and design system

- Tailwind CSS
- shadcn/ui
- Radix UI primitives
- CSS variables for themes and scientific status colors
- Framer Motion for meaningful transitions
- Lucide icons
- custom scientific icons for RNA, QUBO, PDB, ligand, atom, and circuit concepts

### 4.3 Data and state

- TanStack Query for server-state fetching, caching, retries, and pagination
- Zustand for local workspace state
- URL parameters for shareable filters and selections
- Zod for runtime validation of backend responses
- React Hook Form for configuration forms
- WebSocket or Server-Sent Events for live run progress
- IndexedDB through Dexie for cached manifests and recent structures

### 4.4 Molecular and scientific visualization

- Mol* for protein, RNA, DNA, ligand, density, and assembly rendering
- MolViewSpec for reproducible molecular scenes
- forna-compatible rendering or a maintained custom D3 layer for RNA secondary structure
- R2DT-generated SVG for publication-quality RNA 2D layouts
- Apache ECharts or Plotly for scientific charts
- D3 for custom energy landscapes and linked brushing
- React Flow for pipeline and interaction-network visualization

### 4.5 Testing and quality

- Vitest
- React Testing Library
- Playwright
- Storybook
- Mock Service Worker
- axe-core
- Lighthouse CI
- visual regression testing
- ESLint
- Prettier
- strict TypeScript

### 4.6 Observability

- Sentry
- OpenTelemetry-compatible trace identifiers
- structured frontend event logs
- privacy-aware product analytics
- Web Vitals reporting

---

## 5. Global Information Architecture

```text
/
├── /dashboard
├── /projects
│   ├── /projects/new
│   └── /projects/[projectId]
├── /foldq
│   ├── /foldq/new
│   ├── /foldq/runs
│   ├── /foldq/runs/[runId]
│   └── /foldq/compare
├── /structures
│   ├── /structures/search
│   ├── /structures/pdb/[pdbId]
│   ├── /structures/rna
│   └── /structures/compare
├── /rwe
│   ├── /rwe
│   └── /rwe/[rweId]
├── /targets
│   ├── /targets
│   └── /targets/[targetId]
├── /materials
│   ├── /materials
│   └── /materials/[materialId]
├── /analytics
│   ├── /analytics/solver-performance
│   ├── /analytics/energy
│   ├── /analytics/scaling
│   ├── /analytics/resources
│   └── /analytics/structural-evidence
├── /library
│   ├── /library/sequences
│   ├── /library/structures
│   ├── /library/runs
│   └── /library/reports
├── /reports/[reportId]
├── /settings
└── /help
```

---

## 6. Application Shell

### 6.1 Desktop layout

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Global search      Project switcher        Run status      Help   Profile   │
├──────────────┬──────────────────────────────────────────────────────────────┤
│              │ Breadcrumbs / page title / contextual actions               │
│ Navigation   ├──────────────────────────────────────────────────────────────┤
│              │                                                              │
│ Dashboard    │ Main workspace                                               │
│ FoldQ Studio │                                                              │
│ Structures   │                                                              │
│ RWE          │                                                              │
│ Analytics    │                                                              │
│ Library      │                                                              │
│ Reports      │                                                              │
│              │                                                              │
├──────────────┴──────────────────────────────────────────────────────────────┤
│ Optional run drawer / selection inspector / notification center             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Navigation behavior

The left navigation has two modes:

- expanded with icons and labels;
- collapsed with icons and tooltips.

The top bar includes:

- universal command palette;
- project switcher;
- active-run indicator;
- recent entities;
- keyboard shortcuts;
- profile and theme.

### 6.3 Global command palette

Shortcut:

```text
Cmd/Ctrl + K
```

Commands:

- New FoldQ analysis
- Open run by ID
- Search PDB
- Search RNA sequence
- Open target
- Open RWE
- Compare runs
- Export current view
- Toggle theme
- Open documentation

---

## 7. Visual Design Direction

### 7.1 Brand feeling

The product should feel:

- advanced;
- scientific;
- trustworthy;
- cinematic;
- precise;
- premium.

It should not feel:

- like a gaming interface;
- overloaded with neon;
- like a generic admin template;
- medically promotional;
- visually noisy.

### 7.2 Themes

Provide:

- dark scientific theme as default;
- light publication theme;
- system theme.

### 7.3 Suggested design tokens

```css
:root {
  --background: #f8fafc;
  --surface: #ffffff;
  --surface-elevated: #f1f5f9;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --border: #dbe4ee;

  --rna-a: #16a34a;
  --rna-u: #f59e0b;
  --rna-c: #2563eb;
  --rna-g: #dc2626;

  --classical: #0ea5e9;
  --quantum-inspired: #8b5cf6;
  --quantum: #d946ef;
  --reference: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
}

.dark {
  --background: #070b14;
  --surface: #0d1422;
  --surface-elevated: #121c2d;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --border: #22304a;
}
```

### 7.4 Molecular background motif

The dashboard may use a subtle animated field of:

- base-pair arcs;
- QUBO graph edges;
- atom-like points;
- circuit lines.

Motion should stop when reduced-motion is enabled.

---

## 8. Dashboard and Command Center

### 8.1 Hero

Primary message:

> From RNA sequence to explainable structure, optimization, and evidence.

Secondary message:

> Compare classical, quantum-inspired, and quantum candidates with synchronized RNA, PDB, energy, and resource views.

Actions:

- Start FoldQ Analysis
- Explore Structural Evidence
- Open Recent Run

### 8.2 Overview cards

- Active analyses
- Completed analyses
- Sequences analyzed
- PDB structures linked
- Best MFE recovery rate
- Median energy gap
- Median valid-sample rate
- Largest QAOA instance
- Saved RWE records

### 8.3 System pulse

```text
Input → Reference → Candidates → QUBO → Solver → Decode → Rescore → Report
```

Active runs animate at the current stage.

Hovering reveals:

- stage duration;
- warnings;
- number of candidates;
- queued tasks.

---

## 9. New FoldQ Analysis Workflow

Route:

```text
/foldq/new
```

### 9.1 Step 1: Define the RNA

Input methods:

- paste sequence;
- upload FASTA;
- choose from library;
- import from previous run;
- select public benchmark sequence;
- enter public identifier if supported.

Immediate validation:

- valid characters;
- length;
- GC content;
- checksum;
- duplicate warning;
- estimated candidate-pair complexity.

### 9.2 Step 2: Select objective

Options:

- Reproduce ViennaRNA MFE
- Discover low-energy alternatives
- Compare pair and stem encodings
- Compare solvers
- Run QAOA resource analysis
- Evaluate mutation effects
- Run a scaling study

### 9.3 Step 3: Configure biological rules

Controls:

- canonical pairs;
- wobble pairs;
- minimum hairpin distance;
- minimum stem length;
- maximum stem length;
- pseudoknot policy;
- candidate pruning;
- probability-guided mode;
- temperature;
- energy model.

Each control should show expected effects on:

- variable count;
- QUBO density;
- MFE representability;
- solver feasibility.

### 9.4 Step 4: Configure encoding

Options:

- Pair encoding
- Stem encoding
- Hierarchical encoding

Live preview:

| Metric | Pair | Stem |
|---|---:|---:|
| Candidate variables | 84 | 19 |
| Estimated conflicts | 540 | 63 |
| Estimated QUBO density | 0.15 | 0.37 |
| MFE representable | Unknown | Unknown |
| QAOA feasibility | Low | Moderate |

### 9.5 Step 5: Choose solvers

- Exact
- Random
- Greedy
- Local search
- Simulated annealing
- QAOA
- CVaR-QAOA
- Quantum annealing

Each card shows:

- expected feasibility;
- estimated runtime;
- estimated variables;
- hardware requirement;
- stochastic or deterministic status.

### 9.6 Step 6: Experimental design

Controls:

- random seeds;
- reads;
- QAOA depth;
- shots;
- optimizer;
- noise model;
- penalty calibration;
- ablation options;
- output detail level.

### 9.7 Step 7: Review and launch

Show:

- complete configuration;
- estimated workload;
- expected outputs;
- data provenance;
- MFE representability warning;
- QAOA size warning.

---

## 10. Live Run Experience

Route:

```text
/foldq/runs/[runId]
```

### 10.1 Stage timeline

```text
1. Validate sequence
2. Generate ViennaRNA reference
3. Generate candidate pairs
4. Build candidate stems
5. Build conflict graph
6. Construct QUBO
7. Execute solvers
8. Decode samples
9. Repair candidates
10. Rescore with ViennaRNA
11. Calculate statistics
12. Build report
```

### 10.2 Live telemetry

- candidates generated;
- retained stems;
- variables;
- QUBO interactions;
- solver iterations;
- best QUBO energy;
- best ViennaRNA energy;
- valid-sample rate;
- unique structures;
- elapsed time.

### 10.3 Progressive results

Display as soon as available:

- ViennaRNA reference;
- conflict graph;
- first solver samples;
- provisional best structure;
- final metrics.

### 10.4 Human-readable logs

```text
14:08:11  ViennaRNA reference calculated: -13.20 kcal/mol
14:08:13  67 candidate base pairs generated
14:08:14  18 stems retained after pruning
14:08:14  MFE representability check passed
14:08:15  Stem QUBO built with 18 variables and 57 interactions
14:08:17  Simulated annealing started with 1,000 reads
14:08:19  New best valid candidate: -12.80 kcal/mol
```

---

## 11. FoldQ Results Workspace

### 11.1 Workspace layout

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Run summary / solver selector / compare / export                            │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ RNA 2D structure              │ 3D structure / molecular evidence           │
│                               │                                             │
│ synced nucleotide selection   │ synced residue and ligand selection         │
├───────────────────────────────┼─────────────────────────────────────────────┤
│ Energy and structure metrics  │ Candidate ranking and explanation           │
├───────────────────────────────┴─────────────────────────────────────────────┤
│ Tabs: Landscape | QUBO | Samples | Statistics | Resources | Provenance      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Candidate selector

Candidates:

- ViennaRNA MFE
- ViennaRNA centroid
- FoldQ best by QUBO
- FoldQ best by ViennaRNA energy
- best exact candidate
- best annealing candidate
- best QAOA candidate
- pinned candidates

Each displays:

- dot-bracket preview;
- energy;
- energy gap;
- base-pair F1;
- validity;
- repair count;
- sampling frequency;
- confidence.

### 11.3 Synchronized RNA 2D view

Features:

- interactive nucleotide labels;
- base-pair arcs;
- stem grouping;
- loops and bulges;
- candidate versus reference overlay;
- correct pairs;
- missing pairs;
- additional pairs;
- hover tooltip;
- click to pin nucleotide;
- brush selection;
- SVG export.

### 11.4 Sequence track

- nucleotide letters;
- base-pair probability heatmap;
- selected stem spans;
- mismatch markers;
- mutation markers;
- PDB sequence coverage;
- chain mapping;
- linked 2D and 3D selection.

### 11.5 Candidate explanation panel

Example:

```text
This candidate is ranked first by ViennaRNA-rescored energy.

It differs from the MFE reference by two base pairs. One raw overlap was
repaired by removing stem S14 because its marginal contribution was weaker
than stem S3. The final structure is valid and appeared in 7.4% of
annealing samples.
```

---

## 12. Material → Protein Structural Evidence Workflow

### 12.1 Flow

```text
RWE record
    ↓
Material or intervention
    ↓
Proposed molecular target
    ↓
Target identifier and evidence
    ↓
RCSB PDB structure candidates
    ↓
Best structure selection
    ↓
Interactive 3D inspection
    ↓
Ligand, hetero-atom, chain, and interaction analysis
```

### 12.2 RWE detail page

Route:

```text
/rwe/[rweId]
```

Tabs:

- Summary
- Material
- Targets
- Structural Evidence
- Statistics
- Sources
- Provenance

### 12.3 Target card

```text
Target: EGFR
UniProt: P00533
Evidence level: Strong
RWE records: 12
Experimental PDB entries: 487
Best ligand-bound structure: 4WKQ
Best available resolution: 1.50 Å
```

### 12.4 Target search

Search by:

- gene symbol;
- protein name;
- UniProt accession;
- PDB chain;
- backend target ID.

Suggested endpoint:

```http
GET /api/v1/targets/{targetId}/structures
```

Query parameters:

```text
experimentalOnly=true
requireLigand=false
method=xray,em,nmr
maxResolution=4.0
page=1
pageSize=25
sort=quality
```

---

## 13. RCSB PDB Structure Discovery and Ranking

### 13.1 Backend integration

Use:

- RCSB Search API for identifiers;
- RCSB Data API for metadata;
- RCSB ModelServer or structure files for coordinates;
- backend caching;
- normalized frontend responses.

The browser should normally call the Decidion backend adapter rather than multiple direct RCSB endpoints.

### 13.2 Default ranking: best resolution first

For X-ray and cryo-EM entries with reported resolution:

1. lowest resolution value;
2. highest target-chain coverage;
3. highest sequence identity;
4. ligand or hetero-atom relevance;
5. biological assembly available;
6. lower unresolved-residue fraction;
7. fewer engineered mutations;
8. better validation metric when comparable;
9. newest release date as final tie-breaker.

### 13.3 NMR handling

NMR entries do not have directly comparable crystallographic resolution.

Default handling:

1. resolved X-ray and EM structures first;
2. NMR entries after them;
3. rank NMR by coverage;
4. identity;
5. ligand relevance;
6. ensemble completeness;
7. release date.

### 13.4 Ranking modes

- Best resolution
- Highest coverage
- Ligand-bound first
- Most recent
- Best overall quality
- Exact mutation match
- Experimental method

### 13.5 Structure card

```text
┌───────────────────────────────────────────────────────────────────────┐
│ 4WKQ     Recommended                    X-ray     1.50 Å               │
│ EGFR kinase domain with inhibitor                                     │
│ Chains A, B   Coverage 96%   Identity 100%   Ligands: 3               │
│                                                                       │
│ [Preview]  Quality █████   Ligand-bound   Human                       │
│                                                                       │
│ Why selected: best resolution among high-coverage ligand-bound hits. │
│                                                                       │
│ [Open 3D] [Compare] [Save] [Open at RCSB]                            │
└───────────────────────────────────────────────────────────────────────┘
```

### 13.6 Compare structures

Compare up to four structures by:

- resolution;
- method;
- sequence coverage;
- identity;
- mutations;
- ligands;
- assembly;
- missing residues;
- chain count;
- quality score;
- release date.

Views:

- side-by-side;
- superposition;
- synchronized camera;
- ligand comparison;
- residue displacement plot.

---

## 14. Protein 3D Viewer Specification

### 14.1 Rendering engine

Use Mol*.

Support:

- PDB;
- mmCIF;
- BinaryCIF;
- assemblies;
- chains;
- residues;
- ligands;
- measurements;
- surfaces;
- density maps;
- snapshots;
- reproducible scenes.

### 14.2 Default representations

```text
Protein polymer     cartoon
RNA/DNA             cartoon or tube with base detail
Ligands             sticks
Cofactors           sticks
Metal ions          spheres
Carbohydrates       sticks or SNFG-style
Water               hidden
Other hetero-atoms  sticks
```

### 14.3 Ligand and hetero-atom controls

- Show all ligands
- Show selected ligand
- Show hetero-atoms
- Show metals
- Show waters within selected distance
- Show residues within 4 Å
- Show hydrogen bonds
- Show contacts
- Show pocket surface

### 14.4 Ligand panel

Fields:

- component ID;
- name;
- formula;
- chain;
- residue number;
- role;
- nearby residues;
- focus action.

Selecting a ligand:

1. focuses the camera;
2. renders it as sticks;
3. shows nearby residues;
4. opens metadata;
5. highlights the corresponding sequence region.

### 14.5 Residue inspection

Show:

- chain;
- residue name;
- author numbering;
- label numbering;
- mutations;
- secondary structure;
- nearby ligands;
- measured distances;
- RWE annotation;
- linked FoldQ or RNA position.

### 14.6 Viewer toolbar

- rotate;
- reset;
- center;
- fit;
- perspective;
- background;
- clipping;
- screenshot;
- fullscreen;
- representation;
- labels;
- measurement;
- share scene.

---

## 15. RNA Structural Evidence Workflow

### 15.1 Discovery modes

Search by:

- exact PDB ID;
- RNA sequence;
- RNA name;
- RNAcentral ID;
- organism;
- structural class;
- ligand;
- motif;
- selected FoldQ sequence.

### 15.2 Sequence-to-PDB flow

```text
FoldQ RNA sequence
      ↓
RCSB RNA sequence search
      ↓
Candidate polymer entities
      ↓
Entry metadata enrichment
      ↓
Rank by identity, coverage, resolution, and relevance
      ↓
Select experimental structure
      ↓
Render RNA in 3D
      ↓
Synchronize PDB residues with FoldQ nucleotide positions
```

### 15.3 RNA ranking

1. exact sequence match;
2. highest sequence identity;
3. highest sequence coverage;
4. lowest experimental resolution;
5. ligand or cofactor relevance;
6. complete target chain;
7. fewer unresolved or modified nucleotides;
8. biological assembly relevance;
9. release date.

### 15.4 RNA result card

```text
Exact sequence match
Chain R, 42 nucleotides
X-ray, 2.10 Å
Contains Mg²⁺ and ligand SAM
Coverage: 100%
Identity: 100%
```

### 15.5 RNA 3D defaults

- RNA backbone: cartoon or tube;
- bases: sticks or planes;
- base pairs: optional dashed interactions;
- protein partners: translucent cartoon;
- ligands: sticks;
- metal ions: spheres;
- water: hidden;
- selected FoldQ stems: highlighted;
- unmatched regions: muted.

### 15.6 2D ↔ 3D synchronization

Selecting a nucleotide in 2D:

1. highlights sequence position;
2. selects the PDB residue;
3. focuses 3D;
4. shows base-pair partner;
5. shows nearby ligands and ions;
6. displays FoldQ stem membership;
7. displays probability or confidence.

Selecting a PDB residue performs the reverse mapping.

### 15.7 Alignment map

```json
{
  "foldqSequenceId": "seq_123",
  "pdbId": "7ABC",
  "chainId": "R",
  "mapping": [
    {
      "foldqPosition": 1,
      "pdbLabelSeqId": 4,
      "pdbAuthSeqId": 7,
      "identity": true,
      "resolved": true
    }
  ]
}
```

### 15.8 RNA 2D modes

- FoldQ force layout;
- reference layout;
- R2DT template layout;
- linear arc diagram;
- contact map;
- comparison overlay.

### 15.9 Structural comparison

Compare:

- FoldQ base pairs;
- ViennaRNA MFE pairs;
- PDB-observed interactions;
- unresolved nucleotides;
- noncanonical interactions;
- ligand contacts;
- metal coordination.

Metrics:

- predicted-versus-PDB precision;
- recall;
- F1;
- nucleotide coverage;
- resolved fraction;
- modified-nucleotide fraction.

---

## 16. Normalized Structure Type

```ts
export interface RankedStructure {
  pdbId: string;
  title: string;
  experimentalMethod: string;
  resolutionAngstrom: number | null;
  releaseDate: string;
  organismNames: string[];

  target: {
    targetId: string | null;
    name: string | null;
    uniprotAccession: string | null;
  };

  chains: Array<{
    labelAsymId: string;
    authAsymId: string | null;
    entityType: "protein" | "rna" | "dna" | "other";
    sequenceLength: number | null;
    coverage: number | null;
    identity: number | null;
    mutations: string[];
    unresolvedFraction: number | null;
  }>;

  ligands: Array<{
    componentId: string;
    name: string | null;
    formula: string | null;
    chainId: string | null;
    residueNumber: number | null;
    category: "ligand" | "cofactor" | "metal" | "ion" | "other";
  }>;

  quality: {
    overallScore: number;
    resolutionScore: number | null;
    coverageScore: number | null;
    identityScore: number | null;
    ligandScore: number | null;
    completenessScore: number | null;
  };

  ranking: {
    rank: number;
    mode: string;
    reasons: string[];
    warnings: string[];
  };

  files: {
    bcifUrl: string | null;
    cifUrl: string | null;
    pdbUrl: string | null;
  };
}
```

---

## 17. Suggested Backend Endpoints

```http
GET /api/v1/structures/search
GET /api/v1/structures/{pdbId}
GET /api/v1/structures/{pdbId}/file
GET /api/v1/structures/{pdbId}/ligands
GET /api/v1/structures/{pdbId}/chains
GET /api/v1/structures/{pdbId}/scene
POST /api/v1/structures/compare
POST /api/v1/structures/map-sequence
GET /api/v1/targets/{targetId}/structures
GET /api/v1/rna/{sequenceId}/structures
```

---

## 18. Mol* Integration Pseudocode

```tsx
"use client";

import { useEffect, useRef } from "react";

interface MolecularViewerProps {
  structure: RankedStructure;
  scene?: MolecularScene;
  onSelectionChange?: (selection: MolecularSelection) => void;
}

export function MolecularViewer({
  structure,
  scene,
  onSelectionChange,
}: MolecularViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    let disposed = false;
    let viewer: FoldQMolstarController | null = null;

    async function initialize() {
      const module = await import("@/lib/molstar/controller");

      if (disposed || !hostRef.current) return;

      viewer = await module.createFoldQMolstarController({
        element: hostRef.current,
        onSelectionChange,
      });

      await viewer.loadStructure({
        url: structure.files.bcifUrl ?? structure.files.cifUrl!,
        format: structure.files.bcifUrl ? "bcif" : "cif",
      });

      await viewer.applyPreset({
        protein: "cartoon",
        nucleicAcid: "cartoon-and-bases",
        ligand: "sticks",
        heteroAtoms: "sticks",
        metals: "spheres",
        water: "hidden",
      });

      if (scene) {
        await viewer.restoreScene(scene);
      }
    }

    void initialize();

    return () => {
      disposed = true;
      viewer?.dispose();
    };
  }, [structure.pdbId, scene, onSelectionChange]);

  return <div ref={hostRef} className="h-full min-h-[520px] w-full" />;
}
```

Selection model:

```ts
export interface MolecularSelection {
  pdbId: string;
  chainId: string | null;
  labelSeqId: number | null;
  authSeqId: number | null;
  componentId: string | null;
  atomIds: number[];
  selectionType: "residue" | "ligand" | "chain" | "atom" | "empty";
}
```

---

## 19. Solver Performance Dashboard

Route:

```text
/analytics/solver-performance
```

### Summary metrics

- solver success rate;
- median energy gap;
- median base-pair F1;
- exact ground-state recovery;
- valid-sample rate;
- median runtime;
- unique candidates.

### Charts

1. Energy gap by solver
2. Base-pair F1 by solver
3. Runtime versus quality
4. Valid-sample rate
5. Ground-state hit rate
6. Candidate diversity
7. Quality-runtime Pareto frontier
8. Seed variability

### Filters

- sequence length;
- encoding;
- QUBO size;
- solver;
- noise model;
- run status.

---

## 20. Energy Analytics

Route:

```text
/analytics/energy
```

Views:

- QUBO-energy distribution;
- ViennaRNA-energy distribution;
- QUBO versus ViennaRNA scatter;
- energy-rank disagreement;
- best-of-read curve;
- convergence curve;
- top-k recovery;
- energy landscape.

Interactive encoding:

- x-axis: candidate index or embedding;
- y-axis: ViennaRNA energy;
- color: solver;
- size: sampling frequency;
- outline: raw, valid, or repaired;
- reference line: MFE.

Clicking a point:

- selects the candidate;
- updates RNA 2D;
- updates 3D;
- opens explanation.

---

## 21. Structural Accuracy Analytics

Charts:

- precision versus recall;
- F1 by sequence length;
- base-pair distance;
- MFE representability;
- raw versus repaired accuracy;
- stem-level confusion;
- positional error heatmap.

Contact maps:

- ViennaRNA reference;
- FoldQ candidate;
- difference map.

---

## 22. Quantum Resource Dashboard

Route:

```text
/analytics/resources
```

Metrics:

- logical qubits;
- Hamiltonian terms;
- QUBO density;
- QAOA depth;
- transpiled depth;
- one-qubit gates;
- two-qubit gates;
- SWAP gates;
- shots;
- circuit evaluations;
- optimizer iterations;
- estimated hardware time.

Charts:

1. Logical qubits versus sequence length
2. Logical qubits versus candidate stems
3. Circuit depth versus QUBO density
4. Two-qubit gates versus interactions
5. Quality versus depth
6. Quality versus shots
7. Noise versus valid-sample rate
8. Pair versus stem resource savings

Feasibility badges:

- Simulation feasible
- Hardware demo feasible
- Hardware execution high risk
- Decomposition required

---

## 23. Scaling Dashboard

Route:

```text
/analytics/scaling
```

Views:

- candidate pairs versus sequence length;
- candidate stems versus sequence length;
- conflict edges;
- QUBO density;
- memory;
- runtime by stage;
- asymptotic trend;
- decomposition impact.

Runtime waterfall:

- validation;
- ViennaRNA;
- candidates;
- conflicts;
- QUBO;
- solver;
- decoding;
- rescoring;
- reporting.

---

## 24. Structural Evidence Analytics

Route:

```text
/analytics/structural-evidence
```

Statistics:

- RWE records with target mappings;
- targets with PDB structures;
- ligand-bound structures;
- median best resolution;
- experimental-method distribution;
- RNA structures linked to FoldQ sequences;
- exact versus similar matches;
- PDB coverage;
- unresolved mappings.

Charts:

1. Resolution distribution
2. X-ray versus EM versus NMR
3. Target coverage
4. PDB release timeline
5. Ligand frequency
6. Metal-ion frequency
7. RWE-to-target network
8. Material-to-protein interaction matrix

---

## 25. Material → Protein Network

Nodes:

- RWE records;
- materials;
- proteins;
- RNA targets;
- PDB structures;
- ligands.

Edges:

- supported by;
- interacts with;
- targets;
- represented by;
- binds;
- contains.

Interactions:

- filter by evidence strength;
- filter by target class;
- filter by PDB availability;
- hover to highlight paths;
- click protein to open structures;
- click PDB to open 3D;
- search and focus.

---

## 26. Run Comparison Workspace

Route:

```text
/foldq/compare?run=a&run=b
```

Compare up to four runs.

Dimensions:

- sequence;
- encoding;
- candidates;
- penalties;
- solver;
- seed;
- noise;
- QAOA depth;
- structure;
- energy;
- runtime;
- resources.

Difference summary example:

```text
Stem encoding used 71% fewer variables and 82% fewer interactions.

The best stem-encoded candidate improved runtime by 14.2× but lost one
reference stem, reducing base-pair recall from 0.94 to 0.88.
```

---

## 27. QUBO Inspector

Tabs:

- Matrix
- Conflict Graph
- Terms
- Variables
- Penalties
- Ising
- Diagnostics

Matrix view:

- sparse matrix;
- zoom;
- cluster by stem;
- select a coefficient;
- show biological meaning.

Variable view:

- pair or stem;
- positions;
- energy contribution;
- conflicts;
- sample frequency;
- linked RNA selection.

Penalty diagnostics:

- coefficient range;
- hard-constraint margin;
- violation frequency;
- sensitivity curves;
- over-penalization warnings.

---

## 28. Candidate Sample Explorer

Columns:

- rank;
- bit string;
- QUBO energy;
- ViennaRNA energy;
- occurrence count;
- solver;
- raw validity;
- repaired validity;
- repair count;
- base-pair F1;
- exact-match status.

Features:

- virtualization;
- filtering;
- sorting;
- pinning;
- comparison;
- export;
- open structure.

---

## 29. Reports and Decision Cards

Route:

```text
/reports/[reportId]
```

Sections:

1. Input and objective
2. ViennaRNA reference
3. Best FoldQ candidate
4. RNA 2D comparison
5. Experimental PDB evidence
6. Protein or RNA 3D scene
7. Energy comparison
8. Structural metrics
9. Solver statistics
10. Quantum resources
11. Repair history
12. Assumptions
13. Limitations
14. Provenance
15. Reproduction command

Exports:

- HTML;
- PDF from backend;
- Markdown;
- JSON;
- CSV;
- SVG;
- PNG;
- molecular scene.

---

## 30. Frontend Repository Structure

```text
frontend/
├── README.md
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── components.json
├── playwright.config.ts
├── vitest.config.ts
├── .env.example
│
├── public/
│   ├── icons/
│   ├── brand/
│   ├── demo/
│   └── workers/
│
├── src/
│   ├── app/
│   │   ├── (marketing)/
│   │   ├── (application)/
│   │   │   ├── dashboard/
│   │   │   ├── foldq/
│   │   │   ├── structures/
│   │   │   ├── rwe/
│   │   │   ├── targets/
│   │   │   ├── materials/
│   │   │   ├── analytics/
│   │   │   ├── library/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── api/
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── error.tsx
│   │   └── not-found.tsx
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── shell/
│   │   ├── dashboard/
│   │   ├── foldq/
│   │   ├── rna/
│   │   ├── molecular/
│   │   ├── structures/
│   │   ├── analytics/
│   │   ├── rwe/
│   │   ├── reports/
│   │   └── provenance/
│   │
│   ├── features/
│   │   ├── auth/
│   │   ├── projects/
│   │   ├── runs/
│   │   ├── sequences/
│   │   ├── candidates/
│   │   ├── structures/
│   │   ├── targets/
│   │   ├── rwe/
│   │   ├── analytics/
│   │   └── exports/
│   │
│   ├── lib/
│   │   ├── api/
│   │   ├── molstar/
│   │   ├── rna/
│   │   ├── charts/
│   │   ├── export/
│   │   ├── telemetry/
│   │   ├── validation/
│   │   └── utils/
│   │
│   ├── hooks/
│   ├── stores/
│   ├── workers/
│   ├── styles/
│   ├── types/
│   └── test/
│
├── stories/
├── tests/
│   ├── unit/
│   ├── component/
│   ├── accessibility/
│   └── e2e/
└── docs/
    ├── design-system.md
    ├── molecular-viewer.md
    ├── rna-visualization.md
    ├── accessibility.md
    └── performance.md
```

---

## 31. State Architecture

### Server state

TanStack Query:

- runs;
- events;
- candidates;
- structures;
- targets;
- RWE;
- analytics;
- reports.

### Workspace state

Zustand:

- selected run;
- selected candidate;
- selected nucleotide;
- selected residue;
- selected ligand;
- active panel;
- camera synchronization;
- comparison layout;
- unsaved annotations.

### URL state

```text
?candidate=qaoa-17
&structure=4WKQ
&chain=A
&ligand=ATP
&tab=energy
&view=compare
```

### Persistent preferences

- theme;
- panel sizes;
- molecular representation;
- structure-ranking mode;
- chart density;
- reduced motion;
- numbering mode.

---

## 32. Loading and Error Design

Use meaningful loading states:

- Searching experimental PDB structures
- Ranking by resolution and chain coverage
- Downloading BinaryCIF structure
- Building molecular scene
- Mapping FoldQ positions to PDB residues
- Loading solver samples

Empty states:

- No experimental structure found
- No exact RNA match
- No ligand-bound structures
- MFE not representable
- No valid QAOA samples
- No RWE target mapping

When RCSB is unavailable:

- show cached results;
- show retrieval date;
- allow retry;
- preserve current scene;
- never silently replace experimental structures with predicted models.

---

## 33. Performance Requirements

Targets:

- dashboard interactive under 2.5 seconds on a modern laptop;
- route feedback under 100 milliseconds;
- viewer shell visible immediately;
- structure rendered as soon as coordinates are available;
- large tables virtualized;
- chart computations moved to Web Workers.

Mol* optimization:

- lazy-load viewer;
- prefer BinaryCIF;
- load assemblies only when requested;
- hide water by default;
- defer density maps;
- do not prefetch all structure files;
- cancel obsolete requests;
- dispose previous scenes.

---

## 34. Accessibility

Target WCAG 2.2 AA.

Requirements:

- keyboard navigation;
- visible focus;
- accessible dialogs;
- semantic headings;
- reduced-motion support;
- high contrast;
- textual molecular scene summary;
- chain, ligand, and residue tables;
- accessible chart tables;
- no color-only encoding.

---

## 35. Security and Privacy

- authenticated URLs for private structures;
- no API tokens in browser;
- Content Security Policy;
- Zod validation;
- no untrusted HTML;
- no raw private sequences in telemetry;
- no private scientific data sent to third-party analytics;
- privacy-aware error logging.

---

## 36. Testing Plan

### Unit tests

- dot-bracket parsing;
- structure comparison;
- ranking explanations;
- position mapping;
- query keys;
- chart transforms.

### Component tests

- RNA viewer;
- candidate selector;
- structure card;
- ligand panel;
- run timeline;
- QUBO inspector;
- export dialog.

### Mol* integration tests

- viewer initializes;
- structure loads;
- protein cartoon appears;
- ligands render as sticks;
- hetero-atoms render as sticks;
- metals render as spheres;
- selection events propagate;
- scene restore works;
- viewer disposes cleanly.

### End-to-end FoldQ test

1. Create run.
2. Observe live progress.
3. Open candidate.
4. Compare with ViennaRNA.
5. Search RNA PDB structures.
6. Open 3D.
7. Select nucleotide in 2D.
8. Confirm 3D synchronization.
9. Export decision card.

### End-to-end material-to-protein test

1. Open RWE record.
2. Select material.
3. Select target.
4. View ranked PDB entries.
5. Confirm best-resolution high-quality hit ranks first.
6. Open 3D.
7. Confirm ligands and hetero-atoms are sticks.
8. Select ligand.
9. Show nearby residues.
10. Save scene.

---

## 37. Implementation Phases

### Phase 1: Foundation

- app shell;
- authentication integration;
- design system;
- dashboard;
- API client;
- schemas;
- Storybook.

### Phase 2: FoldQ workflow

- new-run wizard;
- live progress;
- candidate list;
- metrics;
- RNA 2D;
- sequence track.

### Phase 3: Analytics

- energy;
- structure;
- solver comparison;
- scaling;
- resource dashboard;
- linked filtering.

### Phase 4: Structural Evidence Atlas

- target pages;
- RWE structural tab;
- PDB search;
- ranked cards;
- comparison.

### Phase 5: Mol* integration

- 3D viewer;
- protein and RNA presets;
- ligand sticks;
- hetero-atoms;
- residue inspection;
- screenshots;
- scenes.

### Phase 6: RNA 2D ↔ 3D synchronization

- sequence mapping;
- linked selection;
- RNA PDB search;
- observed base-pair overlay.

### Phase 7: Reporting and polish

- decision cards;
- shareable links;
- export;
- motion;
- accessibility;
- performance;
- end-to-end tests.

---

## 38. High-Impact Features

### Molecular story mode

1. Show full protein or RNA.
2. Focus target chain.
3. Reveal ligand.
4. Show neighboring residues.
5. Overlay RWE evidence.
6. Explain the interaction.

### Structure-quality lens

Recolor by:

- chain;
- sequence coverage;
- mutation status;
- FoldQ agreement;
- ligand proximity;
- experimental quality.

### Time-travel comparison

Move between:

- raw sample;
- repaired structure;
- ViennaRNA-rescored structure;
- experimental PDB structure.

### Energy-to-structure brushing

Brush low-energy candidates to:

- filter structures;
- update RNA views;
- show recurring stems;
- update statistics.

### Evidence ribbon

```text
RWE source
→ material claim
→ target mapping
→ PDB entry
→ chain
→ ligand
→ residue
→ FoldQ position
```

---

## 39. Definition of Done

### FoldQ

- launch run;
- observe live progress;
- inspect ViennaRNA;
- inspect solver candidates;
- compare 2D structures;
- inspect statistics;
- inspect QUBO and resources;
- export decision card.

### Material → protein

- RWE exposes materials and targets;
- target retrieves experimental PDB structures;
- results rank best resolution first with quality-aware tie-breakers;
- rank explanation is visible;
- selected structure renders in 3D;
- ligands and hetero-atoms are sticks;
- ions are spheres;
- chains and residues are inspectable;
- scenes can be saved.

### RNA

- FoldQ sequence searches matching PDB RNA structures;
- exact and similar matches are distinguished;
- identity, coverage, and resolution are visible;
- RNA renders in 3D;
- RNA 2D and 3D selections synchronize;
- FoldQ, ViennaRNA, and PDB structures can be compared.

### Statistics

- solver, energy, structural, scaling, resource, and evidence dashboards exist;
- charts support filters and linked selection;
- data can be exported;
- accessible table alternatives exist.

---

## 40. Recommended Sprint Backlog

### Sprint 1

- shell;
- theme;
- navigation;
- dashboard;
- API client;
- run list.

### Sprint 2

- FoldQ wizard;
- sequence input;
- preflight;
- launch;
- live event stream.

### Sprint 3

- results workspace;
- candidate selector;
- RNA 2D;
- sequence track;
- core metrics.

### Sprint 4

- analytics;
- comparison;
- QUBO inspector;
- sample explorer.

### Sprint 5

- target page;
- PDB search;
- ranking cards;
- metadata.

### Sprint 6

- Mol* viewer;
- protein and RNA presets;
- ligand and hetero-atom rendering;
- residue inspector.

### Sprint 7

- RWE structural evidence;
- material-target graph;
- saved scenes;
- structure comparison.

### Sprint 8

- RNA PDB mapping;
- 2D and 3D synchronization;
- experimental comparison.

### Sprint 9

- reports;
- export;
- accessibility;
- visual regression;
- performance tuning.

---

## 41. External Technical References

### RCSB PDB

- Search API: https://search.rcsb.org/
- Data API: https://data.rcsb.org/
- Web APIs overview: https://www.rcsb.org/docs/programmatic-access/web-apis-overview
- Search attributes: https://search.rcsb.org/structure-search-attributes.html

### Mol*

- Viewer documentation: https://molstar.org/viewer-docs/
- Developer documentation: https://molstar.org/docs/
- MolViewSpec: https://molstar.org/viewer-docs/extensions/mvs/

### RNA visualization

- forna: https://rna.tbi.univie.ac.at/forna/
- forna source: https://github.com/ViennaRNA/forna
- R2DT: https://r2dt.bio/
- R2DT documentation: https://docs.r2dt.bio/

### FoldQ stack

- ViennaRNA: https://www.tbi.univie.ac.at/RNA/
- ViennaRNA documentation: https://viennarna.readthedocs.io/
- Qiskit: https://www.ibm.com/quantum/qiskit
- D-Wave Ocean: https://docs.dwavequantum.com/en/latest/ocean/

---

## 42. Final Product Statement

Decidion FoldQ should tell one connected scientific story:

```text
Sequence
→ Fold
→ Energy
→ Optimization
→ Uncertainty
→ Experimental Structure
→ Ligand and Target Context
→ Evidence
→ Decision
```

The defining experience is the ability to move seamlessly between:

- a nucleotide in a FoldQ candidate;
- its base-pair role in 2D;
- its experimental residue in a PDB RNA structure;
- its neighboring ligand or ion in 3D;
- its contribution to energy and solver statistics;
- and the RWE or material evidence that motivated the target.

That connected workflow turns FoldQ from a computational demonstration into a complete scientific exploration platform.
