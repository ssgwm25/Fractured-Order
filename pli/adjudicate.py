"""PLI interpretive layer: a Cursor agent strictly executing the codebook.

The agent handles the interpretive steps of PLI — lever/instrument
classification and precedent-tier assignment (with real statutory citations,
found via web research when needed). It must return strict JSON matching
``worksheet_schema.json`` and must cite the codebook rule used at every step.
All arithmetic happens afterwards in ``engine.py``. Strategic orientation is
intake context for National Interest; it is not scored on this Macro worksheet.

Failure policy: one retry on invalid output, then the action is marked
``needs_human`` so the SME adjudicates it manually. The agent never guesses
its way past a validation error.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import jsonschema

HERE = Path(__file__).parent
SCHEMA = json.loads((HERE / "worksheet_schema.json").read_text(encoding="utf-8"))
NI_SCHEMA = json.loads(
    (HERE / "schemas" / "ni_worksheet_schema.json").read_text(encoding="utf-8")
)
GLASL_SCHEMA = json.loads(
    (HERE / "schemas" / "glasl_worksheet_schema.json").read_text(encoding="utf-8")
)
DIPLOMACY_SCHEMA = json.loads(
    (HERE / "schemas" / "diplomacy_worksheet_schema.json").read_text(encoding="utf-8")
)
INFO_SCHEMA = json.loads(
    (HERE / "schemas" / "info_brief_schema.json").read_text(encoding="utf-8")
)
TRIAL_CODEBOOK = (HERE / "codebook" / "03_PLI_TRIAL_CODEBOOK.md").read_text(encoding="utf-8")
MASTER_CODEBOOK = (HERE / "codebook" / "02_ECONOMIC_LEVER_MASTER_CODEBOOK.md").read_text(encoding="utf-8")

DEFAULT_MODEL = os.environ.get("PLI_AGENT_MODEL", "grok-4.5")

SYSTEM_BRIEF = """\
You are the PLI (Petrihos Lever Index) classification agent for the Fractured
Order 2.0 wargame. You STRICTLY execute the codebook provided below. You do
not invent rules, you do not estimate economic effects, and you do not score
anything the codebook does not ask you to score. Your output is reviewed and
approved by a human subject-matter expert; every judgment you make must cite
the codebook rule or real-world authority it rests on.

PLENUM INSTRUMENT OF POWER (actions.mechanism) is the DEFAULT lane map,
not the sole authority over routing:
- Economic → classify L1-L10 + instrument; set ne_facets.diplomacy=false,
  ne_facets.information=false; echo instrument_of_power="Economic".
- Diplomatic → lever=NE, instrument=null; ne_facets.diplomacy=true,
  information=false; instrument_of_power="Diplomatic".
- Informational → lever=NE, instrument=null; ne_facets.information=true,
  diplomacy=false; instrument_of_power="Informational".
- Military → lever=NE, instrument=null; both facets false;
  instrument_of_power="Military".
Do not silently rewrite the team's Instrument of Power. Actions may
bundle multiple tools or be mislabeled: if the stated mechanism conflicts
with the action text / UI levers / bundled authorities, set
needs_human=true and explain the mismatch. You may set a SECONDARY facet
true only with secondary_facet_citation evidence of a clear dual DIME lane.
Ignore non-DIME / joke Instruments tags (e.g. Magic). Diplomacy or Information
listed in Instruments without a cited dual-lane operative act does NOT force
needs_human when mechanism is Economic and a primary L-code is clear.

SPECIAL RULE — TERRITORY / BASING / STRATEGIC ACCESS (L10):
When an Economic filing's operative act is negotiated purchase, cession,
long-term lease, exclusive basing rights, or strategic geographic access
(including SLOC-critical islands/ports) with a payment/lease/offset bargain,
classify L10 (I10.01–I10.04) using tie-break rule 11. Do NOT set
needs_human solely because the act is outside L1–L9. Pure Military or
Diplomatic acts with no transactional access deal remain NE. Intra-
jurisdiction asset/IP/fund seizure remains L4/I4.06, not L10.

SPECIAL RULE — RECIPROCAL FDI PACKAGE (L3 / I3.05):
When an Economic filing is titled or framed as a Reciprocal FDI Package
(or equivalent security-restricted reciprocal investment / investment-access
package) and no single inbound screening, outbound restriction, or
country/sector ban clearly dominates, classify L3 / I3.05 (direction Mixed
unless the text is denial-only or access-only). Do NOT set needs_human solely
because UI levers are "None selected", Implementation/Legislative fields are
empty, or the package could be read as I3.01 vs I3.02 vs I3.04. Prefer a
discrete I3.01–I3.04 code only when the operative act is clearly one of those
alone. UI lever "Reciprocal FDI Package" is a strong prior for L3/I3.05.

SPECIAL RULE — OFFICIAL GOLD / COMMODITY PRICE-INTERVENTION SALES (L8 / I8.04):
When an Economic filing is titled or framed as selling off gold (or another
strategic commodity from official reserves) to manipulate, fix, or move the
market price, classify L8 / I8.04 (direction Coercive unless framed as routine
reserve management). Prefer I8.02 only for supply-security reserve release
without a price-manipulation objective. Do NOT set needs_human solely because
UI levers are "None selected", Implementation/Legislative fields are empty,
Instruments lists include non-DIME junk (e.g. "Magic"), or Diplomacy appears
in the Instruments list without a cited dual-lane diplomatic act. Not L5/I5.04
and not L4 unless sanctions/asset remedies are named. UI lever "Strategic
Reserve Sales" is a strong prior for L8/I8.04.

Your job for the single action below, in order:

1. INSTRUMENT OF POWER: echo `instrument_of_power` from the action's
   mechanism field as the starting lane, set `ne_facets` from the table
   above, and flag needs_human (or secondary facet) when the content
   shows a mislabel or multi-tool second lane.

2. CLASSIFY: assign exactly one primary lever (L1-L10, or NE for
   non-economic) and one primary instrument code, using the master codebook
   Layer 1/Layer 2 definitions, boundary rules, and the eleven tie-break rules.
   UI levers listed in ally_contingencies are strong priors for Economic
   filings (including "Territory & Basing Access" → L10,
   "Reciprocal FDI Package" → L3/I3.05, and
   "Strategic Reserve Sales" → L8/I8.04). Record the deciding
   rule in `classification.rule_citation`.
   Set `direction` per the Direction facet (coercive / inducement / mixed).

3. PRECEDENT TIER: apply the trial codebook's four-tier precedent test to
   the primary instrument as proposed. Cite real statutes, standing
   authorities, or programs in `precedent.citations`. For NE, use tier 4
   with rationale "Not applicable — non-economic".

4. MODIFIERS: set each of the four Implementation modifiers true/false from
   the action text and game state. Only set a modifier true when the
   submission provides evidence for it; give a one-line justification in
   `modifier_rationales` for each true value. For NE, set all false.
   Do NOT score Fit. Do not emit a `fit` object. Declared orientation is
   intake context only; National Interest scores orientation alignment.

5. SUBMISSION MONTH: include ``submission_month`` as the GAME SUBMISSION MONTH
   shown below (YYYY-MM). The orchestrator already grounded that value on a
   fixed 6-month action cadence (not the Plenum wall-clock timer) and will
   overwrite any other month you invent — treat it as informational context,
   not something to derive from the action prose.

If the action cannot be classified cleanly (hopelessly vague or outside the
codebook), set `needs_human` to true and explain in `needs_human_reason`;
leave your best partial classification in place.

OUTPUT CONTRACT: reply with a single fenced JSON code block containing ONLY
the worksheet object, valid against the JSON schema provided. No prose
outside the fence.
"""


def build_prompt(
    action: dict[str, Any],
    orientation: str,
    game_state_notes: str = "",
    *,
    submission_month: str | None = None,
) -> str:
    """Assemble the one-shot prompt for a single action."""
    from tracks.router import normalize_instrument_of_power, parse_ui_levers

    iop = normalize_instrument_of_power(
        action.get("mechanism") or action.get("instrument_of_power")
    )
    ui_levers = parse_ui_levers(action.get("ally_contingencies") or action.get("details"))
    month = submission_month or action.get("submission_month")

    action_block = json.dumps(
        {
            "action_id": action.get("id") or action.get("action_id"),
            "team": action.get("team"),
            "move": action.get("move"),
            "submission_month": month,
            "title": action.get("goal") or action.get("title"),
            "instrument_of_power": iop or action.get("mechanism"),
            "mechanism": action.get("mechanism"),
            "ui_levers": ui_levers,
            "sector": action.get("sector"),
            "supply_chain_focus": action.get("exposure_type"),
            "targets": action.get("targets"),
            "expected_outcomes": action.get("expected_outcomes"),
            "details": action.get("ally_contingencies") or action.get("details"),
        },
        indent=2,
        ensure_ascii=False,
    )

    month_block = (
        f"=== GAME SUBMISSION MONTH (orchestrator-grounded) ===\n{month}\n"
        "Echo this YYYY-MM in worksheet.submission_month. The orchestrator "
        "overwrites timing; do not recompute from action text."
        if month
        else ""
    )

    return "\n\n".join(
        [
            SYSTEM_BRIEF,
            "=== MASTER CODEBOOK (Layers 1-2, boundaries, tie-breaks) ===\n" + MASTER_CODEBOOK,
            "=== TRIAL CODEBOOK (Implementation, precedent tiers) ===\n" + TRIAL_CODEBOOK,
            "=== JSON SCHEMA for your worksheet output ===\n" + json.dumps(SCHEMA, indent=2),
            "=== TEAM'S DECLARED STRATEGIC ORIENTATION (intake context; not scored here) ===\n"
            + f"{orientation}",
            month_block,
            ("=== GAME STATE NOTES (White Cell) ===\n" + game_state_notes) if game_state_notes else "",
            "=== ACTION TO ADJUDICATE ===\n" + action_block,
        ]
    )


def extract_json_worksheet(
    text: str,
    schema: dict[str, Any],
    *,
    cross_check=None,
) -> dict[str, Any]:
    """Pull JSON from an agent reply and validate against a schema."""
    fenced = re.findall(r"```(?:json)?\s*\n(.*?)```", text, flags=re.DOTALL)
    candidates = fenced if fenced else [text]

    last_error: Exception | None = None
    for candidate in reversed(candidates):
        try:
            worksheet = json.loads(candidate.strip())
        except json.JSONDecodeError as err:
            last_error = err
            continue
        jsonschema.validate(worksheet, schema)
        if cross_check is not None:
            cross_check(worksheet)
        return worksheet

    raise ValueError(f"No valid worksheet in agent reply: {last_error}")


def extract_worksheet(text: str) -> dict[str, Any]:
    """Pull the macro JSON worksheet out of the agent reply and validate it."""
    return extract_json_worksheet(text, SCHEMA, cross_check=_cross_check)


def _cross_check(worksheet: dict[str, Any]) -> None:
    """Contract checks the JSON schema cannot express."""
    from tracks.router import default_ne_facets

    classification = worksheet["classification"]
    lever = classification["lever"]
    instrument = classification.get("instrument")
    iop = worksheet.get("instrument_of_power")
    facets = worksheet.get("ne_facets") or {}

    if iop:
        expected = default_ne_facets(iop)
        # Primary facets must match IOP defaults unless secondary citation present
        if not worksheet.get("secondary_facet_citation"):
            if bool(facets.get("diplomacy")) != expected["diplomacy"]:
                raise ValueError(
                    "ne_facets.diplomacy must match Instrument of Power defaults "
                    "unless secondary_facet_citation is provided"
                )
            if bool(facets.get("information")) != expected["information"]:
                raise ValueError(
                    "ne_facets.information must match Instrument of Power defaults "
                    "unless secondary_facet_citation is provided"
                )
        if iop == "Economic" and lever == "NE" and not worksheet.get("needs_human"):
            raise ValueError(
                "Economic Instrument of Power classified NE requires needs_human=true"
            )
        if iop != "Economic" and lever != "NE" and not worksheet.get("needs_human"):
            raise ValueError(
                f"{iop} Instrument of Power must classify as NE "
                "(or set needs_human if contradicting)"
            )

    if lever == "NE":
        if instrument is not None:
            raise ValueError("NE actions must not carry an instrument code")
        return

    if not instrument:
        raise ValueError(f"Lever {lever} requires an instrument code")
    lever_match = re.fullmatch(r"L(\d+)", str(lever))
    instrument_match = re.fullmatch(r"I(\d+)\.(\d{2})", str(instrument))
    if not lever_match or not instrument_match:
        raise ValueError(f"Instrument {instrument} does not belong to lever {lever}")
    if lever_match.group(1) != instrument_match.group(1):
        raise ValueError(f"Instrument {instrument} does not belong to lever {lever}")


def run_agent(prompt: str, *, api_key: str | None = None, model: str = DEFAULT_MODEL) -> str:
    """One-shot Cursor agent run; returns the raw reply text."""
    import win_bridge_patch

    win_bridge_patch.apply()
    from cursor_sdk import Agent, AgentOptions, LocalAgentOptions

    result = Agent.prompt(
        prompt,
        AgentOptions(
            api_key=api_key or os.environ["CURSOR_API_KEY"],
            model=model,
            local=LocalAgentOptions(cwd=str(HERE)),
        ),
    )
    if result.status == "error":
        raise RuntimeError(f"Cursor agent run failed (run id: {result.id})")
    return result.result or ""


def adjudicate_prompt(
    prompt: str,
    schema: dict[str, Any],
    *,
    cross_check=None,
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    max_attempts: int = 2,
    postprocess=None,
) -> dict[str, Any]:
    """Run a Cursor agent against a schema with one validation retry."""
    attempts: list[dict[str, Any]] = []
    working_prompt = prompt

    for attempt in range(1, max_attempts + 1):
        try:
            reply = run_agent(working_prompt, api_key=api_key, model=model)
        except Exception as err:  # startup or run failure — record and retry
            attempts.append({"attempt": attempt, "error": str(err)})
            continue

        try:
            worksheet = extract_json_worksheet(
                reply, schema, cross_check=cross_check
            )
        except (ValueError, jsonschema.ValidationError) as err:
            attempts.append(
                {"attempt": attempt, "error": str(err), "reply": reply[-4000:]}
            )
            working_prompt = (
                prompt
                + "\n\nYour previous reply failed validation with this error, fix it and "
                + f"return ONLY the corrected JSON worksheet:\n{err}"
            )
            continue

        if postprocess is not None:
            worksheet = postprocess(worksheet)

        attempts.append({"attempt": attempt, "ok": True})
        return {
            "worksheet": worksheet,
            "needs_human": bool(worksheet.get("needs_human")),
            "needs_human_reason": worksheet.get("needs_human_reason"),
            "attempts": attempts,
            "model": model,
        }

    return {
        "worksheet": None,
        "needs_human": True,
        "needs_human_reason": "Agent output failed validation after retries",
        "attempts": attempts,
        "model": model,
    }


def adjudicate_action(
    action: dict[str, Any],
    orientation: str,
    *,
    game_state_notes: str = "",
    submission_month: str | None = None,
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    max_attempts: int = 2,
) -> dict[str, Any]:
    """Produce a validated macro worksheet for one action, retrying once.

    Returns a dict with ``worksheet`` (or None), ``attempts`` transcripts for
    the trace record, and ``needs_human`` when validation failed twice or the
    agent itself flagged the action.
    """
    month = submission_month or action.get("submission_month")
    prompt = build_prompt(
        action, orientation, game_state_notes, submission_month=month
    )

    def _stamp_month(worksheet: dict[str, Any]) -> dict[str, Any]:
        if month and isinstance(worksheet, dict):
            worksheet["submission_month"] = month
        return worksheet

    return adjudicate_prompt(
        prompt,
        SCHEMA,
        cross_check=_cross_check,
        api_key=api_key,
        model=model,
        max_attempts=max_attempts,
        postprocess=_stamp_month,
    )


def adjudicate_glasl(
    action: dict[str, Any],
    orientation: str,
    *,
    stage_before: int,
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    max_attempts: int = 2,
) -> dict[str, Any]:
    """Produce a validated Glasl worksheet for one action."""
    from track_prompts import build_glasl_prompt

    prompt = build_glasl_prompt(action, orientation, stage_before=stage_before)

    def _stamp_stages(worksheet: dict[str, Any]) -> dict[str, Any]:
        worksheet = dict(worksheet)
        worksheet["stage_before"] = int(
            worksheet.get("stage_before") or stage_before
        )
        delta = int(worksheet.get("delta", 0))
        if worksheet.get("stage_after") is None:
            worksheet["stage_after"] = max(1, min(9, worksheet["stage_before"] + delta))
        return worksheet

    return adjudicate_prompt(
        prompt,
        GLASL_SCHEMA,
        api_key=api_key,
        model=model,
        max_attempts=max_attempts,
        postprocess=_stamp_stages,
    )


def adjudicate_ni(
    action: dict[str, Any],
    orientation: str,
    *,
    glasl_stage: int | None = None,
    macro_summary: str = "",
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    max_attempts: int = 2,
) -> dict[str, Any]:
    """Produce a validated National Interest worksheet for one action."""
    from track_prompts import build_ni_prompt

    prompt = build_ni_prompt(
        action,
        orientation,
        macro_summary=macro_summary,
        glasl_stage=glasl_stage,
    )

    def _stamp_orientation(worksheet: dict[str, Any]) -> dict[str, Any]:
        worksheet = dict(worksheet)
        worksheet["orientation"] = orientation
        return worksheet

    return adjudicate_prompt(
        prompt,
        NI_SCHEMA,
        api_key=api_key,
        model=model,
        max_attempts=max_attempts,
        postprocess=_stamp_orientation,
    )


def adjudicate_diplomacy(
    action: dict[str, Any],
    orientation: str,
    *,
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    max_attempts: int = 2,
) -> dict[str, Any]:
    """Produce a validated Diplomacy Index worksheet for one action."""
    from track_prompts import build_diplomacy_prompt

    return adjudicate_prompt(
        build_diplomacy_prompt(action, orientation),
        DIPLOMACY_SCHEMA,
        api_key=api_key,
        model=model,
        max_attempts=max_attempts,
    )


def adjudicate_information(
    action: dict[str, Any],
    orientation: str,
    *,
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
    max_attempts: int = 2,
) -> dict[str, Any]:
    """Produce a validated Information brief for one action."""
    from track_prompts import build_info_prompt

    return adjudicate_prompt(
        build_info_prompt(action, orientation),
        INFO_SCHEMA,
        api_key=api_key,
        model=model,
        max_attempts=max_attempts,
    )
