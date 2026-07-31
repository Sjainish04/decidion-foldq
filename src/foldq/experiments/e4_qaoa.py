"""E4: QAOA depth, CVaR, shots, and hardware-realistic noise.

Answers RQ5 and RQ6. Everything runs on local Aer simulators; the noise model
comes from qiskit-ibm-runtime's fake_provider, which ships real IBM device
calibration data locally and needs no account.

MANDATORY CORRECTION 3 -- resource columns, and what a zero does not mean.
`ResourceReport.multi_qubit_gates` counts gates acting on three or more
qubits and must reach this table: it should read exactly zero on every row
here, since `estimate_resources` decomposes the QAOA ansatz down to its
target gate basis before counting (`ansatz.decompose(reps=3)`). A non-zero
value would mean that decomposition never reached the target basis -- a
defect in the pipeline, not a property of the circuit -- so this column is
reported precisely so that failure mode cannot hide.

`estimate_resources` is called below with `backend_name=variant["noise"]`,
which is `None` for every row except the `noise_backend="fake_hanoi"` one.
When `backend_name` is `None`, `transpiled_depth` trivially mirrors
`circuit_depth` and `swap_gates` is trivially 0 -- no specific device
topology was targeted, so those two columns are not a measurement of
anything for those rows. Only the `fake_hanoi` row actually transpiles onto
a real coupling map, and there the same columns carry real information:
calibration on a 5-qubit instance at reps=1 measured ideal depth 24 / 1q 25
/ 2q 20 versus transpiled depth 60 / 1q 55 / 2q 32 -- basis-gate translation
plus routing raises the two-qubit gate count by roughly 60% -- with
`swap_gates == 0` throughout. That zero is *not* "no routing overhead":
Qiskit's transpiler decomposes each SWAP into three CX instructions rather
than emitting a named `swap` instruction, so routing cost shows up entirely
inside `two_qubit_gates`, not in `swap_gates`. Do not read a zero
`swap_gates` column as evidence that fake_hanoi added no routing cost --
compare `two_qubit_gates` against the same-reps, same-shots `noise_backend
== "none"` row instead.

NaN posture (MANDATORY CORRECTION 4): `decode_sample` below is called with
its defaults (`repair=True`, `forbid_crossing=True`), the same combination
`e3_solvers.py` documents as unable to produce a NaN `vienna_energy` or
`energy_gap` -- see that module's docstring for the argument. E4 does not
touch pseudoknot mode at all (that is E5's subject), so this table is not
expected to contain NaN energies in practice; nothing here is aggregated
inside this runner regardless, matching E1-E3 and E5.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from foldq.classical.vienna import ViennaBackend
from foldq.config import FoldQConfig
from foldq.data.generate import generate_benchmark_set
from foldq.decoding.decode import decode_sample
from foldq.evaluation.gates import evaluate_gates
from foldq.evaluation.resources import estimate_resources
from foldq.pipeline import FoldQPipeline
from foldq.solvers.base import SolverConfig
from foldq.solvers.exact import ExactSolver, ExactSolverTooLarge
from foldq.solvers.qaoa import QAOASolver

NAME = "e4_qaoa"
NOISE_BACKEND = "fake_hanoi"


def run(output_dir: Path, *, seed: int = 42, quick: bool = False) -> pd.DataFrame:
    backend = ViennaBackend()
    lengths = [20] if quick else [20, 25, 30]
    per_length = 1 if quick else 3
    depths = (1, 2) if quick else (1, 2, 3)
    shot_counts = (256,) if quick else (256, 1024, 4096)
    maxiter = 20 if quick else 200

    records = generate_benchmark_set(
        lengths, per_length, seed=seed, backend=backend, max_variables=14
    )

    rows = []
    for record in records:
        pipeline = FoldQPipeline(FoldQConfig(seed=seed))
        problem = pipeline.build_problem(record.sequence)
        reference = backend.fold(record.sequence)
        solver_config = SolverConfig(num_reads=shot_counts[0], seed=seed)

        try:
            exact = ExactSolver().solve(problem, solver_config)
        except ExactSolverTooLarge:
            exact = None

        variants = [
            {"reps": reps, "objective": "expectation", "shots": shots, "noise": None}
            for reps in depths
            for shots in shot_counts
        ]
        variants += [
            {"reps": depths[-1], "objective": "cvar", "shots": shot_counts[0], "noise": None}
        ]
        variants += [
            {
                "reps": depths[0],
                "objective": "expectation",
                "shots": shot_counts[0],
                "noise": NOISE_BACKEND,
            }
        ]

        for variant in variants:
            solver = QAOASolver(
                reps=variant["reps"],
                maxiter=maxiter,
                shots=variant["shots"],
                objective=variant["objective"],
                noise_backend=variant["noise"],
            )
            result = solver.solve(problem, solver_config)
            candidate = decode_sample(result.best, problem, backend)
            gates = evaluate_gates(problem, reference, result, candidate, exact)
            resources = estimate_resources(
                problem,
                reps=variant["reps"],
                backend_name=variant["noise"],
                shots=variant["shots"],
                optimizer_iterations=result.metadata["optimizer_iterations"],
                circuit_evaluations=result.metadata["circuit_evaluations"],
            )

            rows.append(
                {
                    "sequence_id": record.sequence_id,
                    "length": record.length,
                    "reps": variant["reps"],
                    "objective": variant["objective"],
                    "shots": variant["shots"],
                    "noise_backend": variant["noise"] or "none",
                    "logical_qubits": resources.logical_qubits,
                    "hamiltonian_terms": resources.hamiltonian_terms,
                    "qubo_density": resources.qubo_density,
                    "circuit_depth": resources.circuit_depth,
                    "transpiled_depth": resources.transpiled_depth,
                    "one_qubit_gates": resources.one_qubit_gates,
                    "two_qubit_gates": resources.two_qubit_gates,
                    "multi_qubit_gates": resources.multi_qubit_gates,
                    "swap_gates": resources.swap_gates,
                    "optimizer_iterations": resources.optimizer_iterations,
                    "circuit_evaluations": resources.circuit_evaluations,
                    "best_qubo_energy": result.best.energy,
                    "found_ground_state": gates.solver_found_ground_state,
                    "base_pair_f1": gates.base_pair_f1,
                    "energy_gap": gates.energy_gap,
                    "runtime_seconds": result.runtime_seconds,
                }
            )

    frame = pd.DataFrame(rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output_dir / f"{NAME}.csv", index=False)
    return frame
