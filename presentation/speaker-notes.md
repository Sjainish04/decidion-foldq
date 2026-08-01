# Speaker notes

Companion to `outline.md`. Timings assume a 9-minute talk; trim Slides 6 and 11
first if you need to reach 7 minutes.

A suggested split, matching the contributions listed in the README: **Siddhartha**
takes Slides 2, 5, 8 and 9 (biology, validation, limitations); **Jainish** takes
Slides 3, 4, 6, 7 and 10 (formulation, encoding, quantum results, reproducibility).

---

## Slide 2 — The uncomfortable truth *(~50s)*

Open with the concession, not the pitch. Judges from Moderna will know ViennaRNA is
exact for pseudoknot-free folding, and leading with a speed claim would cost
credibility in the first thirty seconds.

Say plainly: *"Zuker's algorithm already solves this exactly in cubic time. We are not
going to beat it, and any submission claiming otherwise is wrong."* Then pivot: the
interesting question is what quantum-style formulation buys you **elsewhere** —
specifically where DP structurally cannot go.

---

## Slide 3 — The ladder *(~60s)*

This is the contribution. Spend the time.

The framing that lands: a single F1 score cannot tell you whether your candidate
generator threw away the answer, your energy model preferred the wrong structure, or
your optimizer just missed. Those need completely different fixes, and reporting one
number conflates all three.

Emphasise **"earliest failing gate."** If Gate A fails, blaming the optimizer is
meaningless — it never had the answer available.

---

## Slide 4 — Formulation *(~60s)*

Do not walk through the pipeline box by box. The one idea worth explaining is
**charge-and-refund**.

Analogy that works: *"We optimistically assume every helix closes a hairpin loop and
charge it for that. Then, when another helix turns out to nest inside it, we refund
the charge and bill the correct interior-loop cost instead."* That is a 2-body term,
so a QUBO can hold it — which is the whole trick.

If asked why not just use stacking energies: Slide 5 has the answer (89.5% vs 50.9%).

---

## Slide 5 — Does it work *(~60s)*

Lead with **Gate B 89%** and **r = 0.9935**. Those are the two numbers that establish
the formulation is sound.

The comparison that matters is charge-and-refund versus stacking-only: **89.5% vs
50.9%**. It shows the construction earned its complexity rather than being assumed.

If asked about the 2 energy-model failures out of 19: honest answer is the known
double-refund approximation when several helices nest inside one, documented in the
module and measured in E1.

---

## Slide 6 — Encoding *(~50s, cut first if short)*

Two findings, both counterintuitive enough to be worth stating:

1. Stem encoding beats pair encoding **at matched representability** — 551 vs 858
   variables for identical 100% Gate A. The naive comparison (stem is smaller) is
   wrong unless you control for representability.
2. The representability ceiling has exactly one cause: **lone base pairs**. 100%
   rescue rate when you allow single-pair helices, at 2.83× the variables.

That second point is the useful one — it converts "our encoding loses some structures"
into "it loses exactly the isolated pairs, and here is the price of keeping them."

---

## Slide 7 — The negative result *(~70s — do not rush)*

**Deliver this without hedging.** QAOA reaches the ground state 30–44% of the time.
Classical heuristics reach it 100%. Depth 3 — 177 gates deep, 371 two-qubit gates —
still loses.

The instinct will be to soften it. Don't. A judge who sees a team report a clean
negative result with resource accounting trusts everything else in the talk more.

Have the reason ready if asked: at sizes where exact verification is possible, these
QUBO instances are simply easy. Simulated annealing solves them in 0.19 seconds. There
is no room for advantage in a regime classical methods already own — which is itself a
finding about where quantum optimization should and should not be pointed.

*(If someone asks about our earlier claim that SA missed the optimum at 40 nt: that
was retracted. It was an artifact of using a stochastic Boltzmann sampler as the
"exact" reference. Owning that publicly is a strength, not a weakness.)*

---

## Slide 8 — Pseudoknots *(~70s — this is the payoff)*

Build it in order: ViennaRNA gets half the base pairs → our strict mode reproduces
ViennaRNA exactly → **flip one flag** → 100%.

The line that lands: *"Single-bracket dot-bracket notation cannot express a crossing.
It's not that ViennaRNA is bad at pseudoknots — it structurally cannot return one. We
delete one penalty term and the formulation goes somewhere the classical algorithm has
no representation for."*

**State the caveat yourself, before anyone asks.** The two pseudoknots are constructed,
not literature-derived. Say it plainly and say what's next: substituting cited
sequences. Volunteering a limitation reads as rigour; being caught on it does not.

---

## Slide 9 — Limitations *(~50s)*

Go quickly, but do not skip. The tRNA-Phe number (**F1 0.326**) is the important one —
it shows the method degrades on real structures at scale, and reporting it unprompted
is exactly the credibility the rest of the talk depends on.

If asked "why is tRNA so much worse": 76 nt gives 229 variables, and the cloverleaf's
multiloop junction is precisely the k-body structure a degree-2 QUBO approximates worst.

---

## Slide 10 — Reproducibility *(~40s)*

Key points: one command regenerates every table, the manifest pins commit and seed,
and it all runs on free local simulators with no account.

The sentence worth saying: *"Every number in our README traces to committed output. We
retracted several early claims when they didn't — including one of our own headline
findings."* That is a strong close to the technical section.

---

## Slide 12 — Closing *(~30s)*

Three beats: what we built, what we found, why the ladder matters.

End on the ladder, not the pseudoknots. The pseudoknot result is the flashiest thing in
the talk, but the diagnostic method is what generalises beyond RNA folding — and it is
what a judge can imagine applying to their own problem.

---

## Anticipated questions

**"Isn't this just proving quantum doesn't work?"**
It shows QAOA doesn't beat classical heuristics *in the regime where we can verify
exactly*, which is a narrow and honest claim. It also shows where formulation-level
thinking does pay — pseudoknots — and gives resource numbers for what a larger
instance would cost.

**"Why not use real hardware?"**
Hardware is optional per the challenge rules. We used local simulators with real IBM
calibration data for noise, which gives hardware-realistic behaviour with no queue and
no cost. The backend sits behind an interface, so hardware drops in without refactoring.

**"How do you know the QUBO is correct?"**
Gate B measures it directly against ViennaRNA's exact optimum: 89% agreement. And the
exact solver is deterministic tree decomposition, not sampling — a distinction that
cost us a real defect to learn.

**"What would you do with more time?"**
Cited pseudoknot fixtures first, then multi-body loop terms via quadratization, then
graph decomposition for longer sequences.
