"""Compose the final PLI Master Codebook markdown (not a trial collage).

Uses Layer 1-2 and supporting tables from the economic master codebook,
Layer 3 Implementation/Fit + macro adjudication from the current scoring
revision, then NI / Glasl / Diplomacy / Information tracks.
Omits retired Implementation Fit (0-4), trial change notes, and open items.
"""
from __future__ import annotations

import re
from pathlib import Path

CB = Path(__file__).resolve().parent / "codebook"


def _strip_h1(text: str) -> str:
    lines = text.splitlines()
    if lines and lines[0].startswith("# "):
        lines = lines[1:]
        while lines and not lines[0].strip():
            lines = lines[1:]
    return "\n".join(lines)


def extract_sections(text: str, titles: list[str]) -> dict[str, str]:
    """Return {title: body} for ## sections whose title matches exactly."""
    text = _strip_h1(text)
    parts = re.split(r"(?m)^## ", text)
    out: dict[str, str] = {}
    wanted = set(titles)
    for part in parts[1:]:
        lines = part.splitlines()
        if not lines:
            continue
        title = lines[0].strip()
        if title in wanted:
            body = "\n".join(lines[1:]).strip()
            out[title] = body
    return out


def section(title: str, body: str) -> str:
    return f"## {title}\n\n{body.strip()}\n"


ARCHITECTURE = """## Architecture: three layers, one hierarchy

```
Layer 1 — PRIMARY LEVER (exactly one)      What economic domain are you operating in?
Layer 2 — POLICY INSTRUMENT (one primary)  What specific tool executes the action?
Layer 3 — IMPLEMENTATION (1-10)            Can it be executed, and on what timeline?
          FIT (1-10)                       Does it advance the declared orientation?

Facets (tie-breaks & context only)         Direction, Sector, Target, Coalition, Orientation
```

- Levers answer **"where in economic statecraft?"**
- Instruments answer **"how, specifically?"**
- Implementation answers **"can it be done, and when do effects arrive?"**
- Fit answers **"is it the right move for the declared strategy?"**

**Operating principle — PLI adjudicates, the SME approves.** Scores and trend lines are produced from documented rules; White Cell approve/override is the adjudication of record.

**Track routing (Instrument of Power is the default lane, not the sole authority).** Plenum `actions.mechanism` (Diplomatic | Informational | Military | Economic) sets the *starting* track map: Economic filings run Layers 1–3 and macroeconomic adjudication; all actions receive National Interest and Glasl; Diplomatic filings receive Diplomacy indexing; Informational filings receive an unscored Information brief. That label is **not** decisive by itself. Actions often bundle multiple tools, carry a secondary DIME lane, or are mislabeled at intake. The agent and White Cell must read the action text, UI levers, and bundled authorities against the stated Instrument of Power. If the label and content diverge — or a second lane is clearly present — do **not** force the wrong track: set `needs_human=true` with an explanation, and/or open a **secondary facet** only with a cited dual-lane rationale (`secondary_facet_citation`).

![Plenum adjudication workflow](PLENUM_Adjudication_Workflow.png)

*Plenum adjudication workflow — White Cell completeness, Instrument of Power routing, parallel tracks, and SME approve/override.*
"""


def main() -> None:
    master = (CB / "02_ECONOMIC_LEVER_MASTER_CODEBOOK.md").read_text(encoding="utf-8")
    trial = (CB / "03_PLI_TRIAL_CODEBOOK.md").read_text(encoding="utf-8")

    m = extract_sections(
        master,
        [
            "Layer 1 — The ten economic levers",
            "Layer 2 — Policy instruments (by lever)",
            "Tie-break hierarchy (lever assignment)",
            "Currency, bond, and foreign exchange operations",
        ],
    )
    t = extract_sections(
        trial,
        [
            "Layer 3a — Implementation score (1–10)",
            "Layer 3b — Fit score (1–10)",
            "Section 6 — Macroeconomic adjudication",
            "Facets — tie-breaks and context only",
            "Intake and adjudication record (revised)",
            "Fractured Order 1.0 Blue corpus — provisional rescoring",
        ],
    )

    # Clean trial-only wording in retained sections
    intake = t["Intake and adjudication record (revised)"]
    intake = intake.replace(
        "Retired fields: `ImplementationFit`, `Feasibility` (absorbed into Implementation), "
        "`Alignment` (absorbed into Fit). `DesignScore` remains a rubric matter outside PLI. "
        "New field: `SMEReview` — no adjudication is final until it carries an SME approval "
        "or a documented override.",
        "`DesignScore` remains outside PLI. No adjudication is final until `SMEReview` "
        "carries an SME approval or a documented override.",
    )

    corpus = t["Fractured Order 1.0 Blue corpus — provisional rescoring"]
    corpus = re.sub(
        r"^Provisional Implementation and Fit scores.*?rationale each\.\s*",
        "Reference Implementation and Fit scores for the eleven Blue actions "
        "(Blue orientation: Reframing).\n\n",
        corpus,
        count=1,
        flags=re.S,
    )
    corpus = re.sub(
        r"\nNote the diagnostic gain over the old combined score:.*",
        "",
        corpus,
        flags=re.S,
    )

    macro = t["Section 6 — Macroeconomic adjudication"]

    fit = t["Layer 3b — Fit score (1–10)"]
    fit = re.sub(
        r"\n\*\*Intake change:\*\*.*\n?",
        "\n",
        fit,
    )

    parts: list[str] = []
    parts.append(
        """# Fractured Order 2.0 — PLI Master Codebook

**Statecraft Simulations Group · William & Mary**  
**Scope:** Macroeconomic adjudication + National Interest + Glasl escalation + Diplomacy indexing + Information SME brief

**Annotated bibliography:** `PLI_Annotated_Bibliography.md`

---
"""
    )

    parts.append("\n# Part I — Macroeconomic Adjudication\n\n")
    parts.append(ARCHITECTURE + "\n")
    parts.append(section("Layer 1 — The ten economic levers", m["Layer 1 — The ten economic levers"]))
    parts.append(section("Layer 2 — Policy instruments (by lever)", m["Layer 2 — Policy instruments (by lever)"]))
    parts.append(section("Layer 3a — Implementation score (1–10)", t["Layer 3a — Implementation score (1–10)"]))
    parts.append(section("Layer 3b — Fit score (1–10)", fit))
    parts.append(section("Macroeconomic adjudication", macro))
    parts.append(section("Facets — tie-breaks and context only", t["Facets — tie-breaks and context only"]))
    parts.append(section("Tie-break hierarchy (lever assignment)", m["Tie-break hierarchy (lever assignment)"]))
    parts.append(
        section(
            "Currency, bond, and foreign exchange operations",
            m["Currency, bond, and foreign exchange operations"],
        )
    )
    parts.append(section("Intake and adjudication record", intake))
    parts.append(section("Fractured Order 1.0 Blue corpus reference", corpus))

    track_files = [
        ("Part II — National Interest", "04_NATIONAL_INTEREST_CODEBOOK.md"),
        ("Part III — Glasl Escalation", "05_GLASL_ESCALATION_CODEBOOK.md"),
        ("Part IV — Diplomacy Index", "06_DIPLOMACY_INDEX_CODEBOOK.md"),
        ("Part V — Information Brief Specification", "07_INFORMATION_BRIEF_SPEC.md"),
    ]
    for title, fname in track_files:
        body = _strip_h1((CB / fname).read_text(encoding="utf-8")).strip()
        body = re.sub(r"(?m)^\*\*Version:\*\*.*\n?", "", body).strip()
        parts.append(f"\n\n# {title}\n\n{body}\n")

    out = CB / "01_PLI_MASTER_CODEBOOK.md"
    out.write_text("".join(parts), encoding="utf-8")
    legacy = CB / "01_PLI_MULTI_TRACK_MASTER_CODEBOOK.md"
    if legacy.exists() and legacy.resolve() != out.resolve():
        legacy.unlink()
    print(f"Wrote {out} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
