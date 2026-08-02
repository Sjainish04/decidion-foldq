"""Resolve and verify this project's bibliography against the Crossref API.

Writes `docs/references.json` with one record per reference, each carrying the
metadata Crossref returned and the date it was checked.

The point is that nothing here is hand-typed from memory. Every DOI is either
resolved from the work's title through Crossref's search and then fetched back to
confirm it exists, or — for preprints, documentation and software repositories,
which Crossref does not index — recorded explicitly as having no DOI rather than
being given a plausible-looking one.

This project has already had to retract one fabricated provenance. A citation
list is exactly the surface where an invented identifier looks most credible and
does the most damage, so the verification is machine-checked and re-runnable:

    python scripts/verify_references.py            # verify, write the JSON
    python scripts/verify_references.py --check    # fail if anything stopped resolving
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path

API = "https://api.crossref.org/works"
UA = "decidion-foldq/0.1 (https://github.com/Sjainish04/decidion-foldq; mailto:jainish.solanki@mail.utoronto.ca)"
OUTPUT = Path("docs/references.json")


@dataclass
class Reference:
    """One bibliography entry, before verification."""

    key: str
    title: str
    role: str
    # Set where the DOI is already known with certainty; otherwise resolved by
    # title search. `None` with `indexed=False` means Crossref does not cover
    # this kind of work at all.
    doi: str | None = None
    url: str | None = None
    indexed: bool = True
    note: str = ""


@dataclass
class VerifiedReference:
    key: str
    title: str
    role: str
    doi: str | None
    url: str | None
    crossref_verified: bool
    resolved_title: str | None = None
    container: str | None = None
    year: int | None = None
    authors: list[str] = field(default_factory=list)
    verified_on: str | None = None
    note: str = ""


# Roles say why the work is cited, so the page can be filtered by role rather
# than presenting one undifferentiated list.
REFERENCES: list[Reference] = [
    Reference(
        "lorenz2011",
        "ViennaRNA Package 2.0",
        "reference implementation",
        doi="10.1186/1748-7188-6-26",
        note="Every energy coefficient in this project comes from this package's Turner primitives.",
    ),
    Reference(
        "lyngso2000",
        "RNA Pseudoknot Prediction in Energy-Based Models",
        "complexity result",
        note="Establishes that pseudoknotted folding is NP-hard, which is why this project treats it as the interesting regime.",
    ),
    Reference(
        "turner2010",
        "NNDB: the nearest neighbor parameter database for predicting stability of nucleic acid secondary structure",
        "energy model",
        note="The nearest-neighbour parameters underlying the ViennaRNA energy model.",
    ),
    Reference(
        "zuker1981",
        "Optimal computer folding of large RNA sequences using thermodynamics and auxiliary information",
        "classical baseline",
        note="The dynamic program this project measures itself against and does not claim to beat.",
    ),
    Reference(
        "mccaskill1990",
        "The equilibrium partition function and base pair binding probabilities for RNA secondary structure",
        "classical baseline",
        note="Partition-function folding; the basis of the ensemble view ViennaRNA also exposes.",
    ),
    Reference(
        "farhi2014",
        "A Quantum Approximate Optimization Algorithm",
        "quantum method",
        indexed=False,
        url="https://arxiv.org/abs/1411.4028",
        note="Preprint; QAOA as implemented here. Not indexed by Crossref.",
    ),
    Reference(
        "barkoutsos2020",
        "Improving Variational Quantum Optimization using CVaR",
        "quantum method",
        doi="10.22331/q-2020-04-20-256",
        note="The CVaR objective variant this project tested against the plain expectation value.",
    ),
    Reference(
        "kadowaki1998",
        "Quantum annealing in the transverse Ising model",
        "quantum-inspired method",
        note="The basis of the path-integral simulated quantum annealing solver.",
    ),
    Reference(
        "zaborniak2022",
        "A QUBO Model of the RNA Folding Problem Optimized by Variational Hybrid Quantum Annealing",
        "prior QUBO formulation",
        indexed=False,
        url="https://arxiv.org/abs/2208.04367",
        note="Preprint. Closest prior work on QUBO-encoded RNA folding.",
    ),
    Reference(
        "jiang2023",
        "Predicting RNA Secondary Structure on Universal Quantum Computer",
        "prior QUBO formulation",
        indexed=False,
        url="https://arxiv.org/abs/2305.09561",
        note="Preprint.",
    ),
    Reference(
        "alevras2024",
        "mRNA Secondary Structure Prediction Using Utility-Scale Quantum Computers",
        "prior QUBO formulation",
        indexed=False,
        url="https://arxiv.org/abs/2405.20328",
        note="Preprint.",
    ),
    Reference(
        "kumar2025",
        "Towards Secondary Structure Prediction of Longer mRNA Sequences Using a Quantum-Centric Optimization Scheme",
        "prior QUBO formulation",
        indexed=False,
        url="https://arxiv.org/abs/2505.05782",
        note="Preprint.",
    ),
    Reference(
        "berman2000",
        "The Protein Data Bank",
        "structural data",
        # Given explicitly: the title is too generic for Crossref's bibliographic
        # search to disambiguate, and it returned nothing. Confirmed by fetching
        # this DOI directly (Nucleic Acids Research, 2000).
        doi="10.1093/nar/28.1.235",
        note="The archive the structural-evidence layer queries; PDB 1EHZ is the tRNA benchmark's structure.",
    ),
    Reference(
        "shi2000",
        "The crystal structure of yeast phenylalanine tRNA at 1.93 Å resolution: a classic structure revisited",
        "structural data",
        note="PDB 1EHZ. The experimental structure of this project's 76-nt benchmark sequence.",
    ),
    Reference(
        "glover2019",
        "Quantum Bridge Analytics I: a tutorial on formulating and using QUBO models",
        "formulation",
        note="Standard reference for QUBO formulation and penalty construction.",
    ),
]


def _get(url: str) -> dict | None:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except Exception as error:  # noqa: BLE001 - any failure means "not verified"
        print(f"    ! {error}", file=sys.stderr)
        return None


def resolve_by_title(title: str) -> str | None:
    """Ask Crossref for the DOI of a work by title.

    Only accepts a hit whose returned title matches closely, so a loose search
    cannot silently attach the wrong DOI to a reference.
    """
    query = urllib.parse.urlencode({"query.bibliographic": title, "rows": 5})
    payload = _get(f"{API}?{query}")
    if not payload:
        return None

    def normalise(value: str) -> str:
        return "".join(c for c in value.lower() if c.isalnum())

    target = normalise(title)
    for item in payload["message"].get("items", []):
        for candidate in item.get("title") or []:
            got = normalise(candidate)
            if got.startswith(target[:60]) or target.startswith(got[:60]):
                return item["DOI"]
    return None


def verify(reference: Reference) -> VerifiedReference:
    print(f"  {reference.key}")

    if not reference.indexed:
        return VerifiedReference(
            key=reference.key,
            title=reference.title,
            role=reference.role,
            doi=None,
            url=reference.url,
            crossref_verified=False,
            note=reference.note,
        )

    doi = reference.doi or resolve_by_title(reference.title)
    if not doi:
        print("    no DOI resolved")
        return VerifiedReference(
            key=reference.key,
            title=reference.title,
            role=reference.role,
            doi=None,
            url=reference.url,
            crossref_verified=False,
            note=reference.note,
        )

    payload = _get(f"{API}/{urllib.parse.quote(doi)}")
    if not payload:
        print(f"    DOI {doi} did NOT resolve")
        return VerifiedReference(
            key=reference.key,
            title=reference.title,
            role=reference.role,
            doi=doi,
            url=reference.url,
            crossref_verified=False,
            note=reference.note,
        )

    message = payload["message"]
    dates = message.get("published-print") or message.get("published") or {}
    year = (dates.get("date-parts") or [[None]])[0][0]
    authors = [
        " ".join(filter(None, [a.get("given"), a.get("family")])) for a in message.get("author", [])
    ][:8]

    print(f"    verified {doi}")
    return VerifiedReference(
        key=reference.key,
        title=reference.title,
        role=reference.role,
        doi=doi,
        url=f"https://doi.org/{doi}",
        crossref_verified=True,
        resolved_title=(message.get("title") or [None])[0],
        container=(message.get("container-title") or [None])[0],
        year=year,
        authors=authors,
        verified_on=dt.date.today().isoformat(),
        note=reference.note,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="re-verify and exit non-zero if a previously verified DOI stopped resolving",
    )
    args = parser.parse_args()

    print(f"Verifying {len(REFERENCES)} references against Crossref\n")
    results = []
    for reference in REFERENCES:
        results.append(verify(reference))
        time.sleep(0.3)  # courtesy rate limit on a free public API

    verified = sum(1 for r in results if r.crossref_verified)
    print(f"\n{verified}/{len(results)} verified against Crossref")
    print(f"{len(results) - verified} carry no DOI (preprints, docs, software)")

    if args.check:
        previous = json.loads(OUTPUT.read_text())["references"]
        was = {r["key"] for r in previous if r["crossref_verified"]}
        now = {r.key for r in results if r.crossref_verified}
        regressed = was - now
        if regressed:
            print(f"\nFAIL these DOIs stopped resolving: {sorted(regressed)}")
            sys.exit(1)
        print("\nPASS no previously verified DOI regressed")
        return

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {
                "generated_by": "scripts/verify_references.py",
                "verified_on": dt.date.today().isoformat(),
                "crossref_verified": verified,
                "total": len(results),
                "references": [asdict(r) for r in results],
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
