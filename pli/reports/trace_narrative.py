"""Auto-generate transparent SME narratives from multi-track adjudication records."""
from __future__ import annotations

from typing import Any

from reports.ni_titles import national_interest_section_title


def _lines(title: str, body: list[str]) -> str:
    parts = [f"## {title}", ""]
    parts.extend(body)
    parts.append("")
    return "\n".join(parts)


def macro_narrative(macro: dict[str, Any] | None) -> str:
    if not macro:
        return _lines("Macroeconomic adjudication", ["No macro track record."])
    if macro.get("status") == "skipped_ne" or (macro.get("trend") or {}).get("no_effect"):
        reason = (macro.get("trend") or {}).get("reason") or macro.get("trend", {}).get(
            "no_effect_reason"
        ) or "non-economic / no lever vector"
        return _lines(
            "Macroeconomic adjudication",
            [
                f"No macroeconomic vector applied ({reason}).",
                "Indicators remain on the sourced baseline. Escalation and National Interest "
                "tracks still apply.",
            ],
        )
    if macro.get("status") == "needs_human":
        return _lines(
            "Macroeconomic adjudication",
            [f"Needs human adjudication: {macro.get('needs_human_reason')}"],
        )

    classification = macro.get("classification") or {}
    impl = macro.get("implementation") or {}
    trend = macro.get("trend") or {}
    lines = [
        f"Lever **{classification.get('lever')}** / instrument "
        f"**{classification.get('instrument')}** "
        f"({classification.get('direction')}).",
        f"Rule cited: {classification.get('rule_citation')}",
        f"Implementation **{impl.get('score')}/10** "
        f"(band {trend.get('implementation_band')}).",
        "Path persistence follows the lever×indicator matrix (horizon hold or duration cap); Fit does not modulate the trend.",
        "",
        "Per-indicator verdicts:",
    ]
    for key, ind in (trend.get("indicators") or {}).items():
        lines.append(
            f"- {ind.get('label', key)}: {ind.get('verdict', 'n/a')} "
            f"(post-action vs baseline)"
        )
    return _lines("Macroeconomic adjudication", lines)


def ni_narrative(ni: dict[str, Any] | None, *, team: Any = None) -> str:
    title = national_interest_section_title(team)
    if not ni:
        return _lines(title, ["No NI track record."])
    if ni.get("status") == "needs_human":
        return _lines(
            title,
            [f"Needs human adjudication: {ni.get('needs_human_reason')}"],
        )
    lines = [f"Orientation: **{ni.get('orientation')}**"]
    assessment = ni.get("orientation_assessment") or {}
    if assessment:
        lines.append(
            f"Alignment **{assessment.get('alignment')}** · "
            f"horizon **{assessment.get('effect_horizon')}** · "
            f"orientation_net **{ni.get('orientation_net'):+d}**"
            if ni.get("orientation_net") is not None
            else f"Alignment **{assessment.get('alignment')}** · "
            f"horizon **{assessment.get('effect_horizon')}**"
        )
        if assessment.get("primary_domains"):
            lines.append(
                "Primary domains: " + ", ".join(assessment["primary_domains"])
            )
        if assessment.get("rationale"):
            lines.append(assessment["rationale"])
    lines.append("")
    for domain, entry in (ni.get("domain_deltas") or {}).items():
        lines.append(
            f"- **{domain}** ({entry.get('label')}): "
            f"{entry.get('delta'):+d} — {entry.get('rationale')}"
        )
    if ni.get("threat_cross_check"):
        tc = ni["threat_cross_check"]
        lines.extend(
            [
                "",
                "Threat cross-check (Capability × Will × Vulnerability):",
                f"- Capability: {tc.get('capability')}",
                f"- Will: {tc.get('will')}",
                f"- Vulnerability: {tc.get('vulnerability')}",
            ]
        )
    if ni.get("cross_domain_alert"):
        lines.append(
            "",
        )
        lines.append(
            "**Cross-domain alert:** high Glasl stage with NI-3− and NI-2+ "
            "(alliance credibility risk)."
        )
    lines.extend(["", "Engine trace:"] + [f"- {t}" for t in ni.get("trace") or []])
    return _lines(title, lines)


def glasl_narrative(glasl: dict[str, Any] | None) -> str:
    if not glasl:
        return _lines("Escalation (Glasl)", ["No Glasl track record."])
    if glasl.get("status") == "needs_human" and glasl.get("delta") is None:
        return _lines(
            "Escalation (Glasl)",
            [f"Needs human adjudication: {glasl.get('needs_human_reason')}"],
        )
    lines = [
        f"Stage before: **{glasl.get('stage_before')}** "
        f"({glasl.get('stage_before_label')})",
        f"Delta: **{glasl.get('delta'):+d}**" if glasl.get("delta") is not None else "Delta: n/a",
        f"Stage after: **{glasl.get('stage_after')}** "
        f"({glasl.get('stage_after_label')})",
        f"Rationale: {glasl.get('rationale')}",
    ]
    lines.extend(["", "Engine trace:"] + [f"- {t}" for t in glasl.get("trace") or []])
    return _lines("Escalation (Glasl)", lines)


def diplomacy_narrative(dipl: dict[str, Any] | None) -> str:
    if not dipl:
        return ""
    if dipl.get("status") == "needs_human":
        return _lines(
            "Diplomacy index",
            [f"Needs human indexing: {dipl.get('needs_human_reason')}"],
        )
    lines = [
        f"Code: `{dipl.get('code_string')}`",
        f"Band: **{dipl.get('band')}** | Category: {dipl.get('category')}",
        f"Policy style: {dipl.get('policy_style')}",
        f"Rationale: {dipl.get('rationale')}",
        "",
        "This is an index code, not a numeric score.",
    ]
    return _lines("Diplomacy index", lines)


def information_narrative(info: dict[str, Any] | None) -> str:
    if not info:
        return ""
    if info.get("status") == "needs_human":
        return _lines(
            "Information brief",
            [f"Needs human brief: {info.get('needs_human_reason')}"],
        )
    sections = info.get("sections") or {}
    lines = [
        "Unscored SME briefing (editable). No information score is assigned.",
        "",
        "### Summary",
        sections.get("summary", ""),
        "",
        "### Audiences",
        sections.get("audiences", ""),
        "",
        "### Narratives",
        sections.get("narratives", ""),
        "",
        "### Second-order effects",
        sections.get("second_order_effects", ""),
        "",
        "### SME questions",
        sections.get("sme_questions", ""),
        "",
        "### Suggested SME edits",
        sections.get("suggested_sme_edits", ""),
    ]
    return _lines("Information brief", lines)


def record_to_markdown(record: dict[str, Any]) -> str:
    action = record.get("action") or {}
    tracks = record.get("tracks") or {}
    routing = tracks.get("routing") or {}
    header = [
        f"# Per-action adjudication report — {record.get('action_id')}",
        "",
    ]
    if record.get("pilot_synthetic"):
        header.extend(
            [
                "> **SYNTHETIC OFFLINE PILOT — NOT SME-APPROVED.** "
                "NI/Glasl/Info/Diplomacy values in this file are wiring fixtures, "
                "not Fractured Order 1.0 White Cell judgments.",
                "",
            ]
        )
    header.extend(
        [
        f"**Title:** {action.get('goal') or 'n/a'}",
        f"**Instrument of Power:** {routing.get('instrument_of_power') or action.get('instrument_of_power')}",
        f"**Team / Move:** {action.get('team')} / {action.get('move')}",
        f"**Codebook:** {record.get('codebook_version')}",
        f"**Status:** {record.get('status')}",
        f"**Track statuses:** {record.get('track_statuses')}",
        "",
        "This report is generated from engine traces so the SME can see exactly how "
        "each track reached its conclusion. Edit outputs in Plenum (or the sidecar) "
        "as needed; overrides become the adjudication of record.",
        "",
        "### Tracks scheduled",
        f"- Macro: {routing.get('tracks', {}).get('macro')}",
        f"- Diplomacy: {routing.get('tracks', {}).get('diplomacy')}",
        f"- Information: {routing.get('tracks', {}).get('information')}",
        f"- National Interest: {routing.get('tracks', {}).get('national_interest')}",
        f"- Glasl: {routing.get('tracks', {}).get('glasl')}",
        "",
        ]
    )
    body = []
    # Omit Macro when routing did not schedule it (Green proposals, Dip/Info, etc.).
    # skipped_ne stubs are never narrated as a Macro section.
    macro = tracks.get("macro")
    if (routing.get("tracks") or {}).get("macro") and macro and macro.get("status") not in (
        "skipped_ne",
        "skipped",
    ):
        body.append(macro_narrative(macro))

    team = action.get("team")
    body.extend(
        [
            ni_narrative(tracks.get("national_interest"), team=team),
            glasl_narrative(tracks.get("glasl")),
            diplomacy_narrative(tracks.get("diplomacy")),
            information_narrative(tracks.get("information")),
            _lines(
                "PLI multi-track footnote",
                [
                    "PLI now runs parallel tracks after White Cell completeness: macroeconomic "
                    "adjudication (Economic Instrument of Power only), Diplomacy indexing "
                    "(Diplomatic), an unscored Information brief (Informational), and always-on "
                    "National Interest (six-domain National War College tier deltas; U.S./Blue-centric "
                    "for every team) plus Glasl escalation "
                    "staging. Charts reuse the canonical `pli_charts.py` / FO report generators. "
                    "Sources: `PLI_Annotated_Bibliography.md`."
                ],
            ),
        ]
    )
    return "\n".join(header + body)


def move_rollups(records: list[dict[str, Any]]) -> str:
    lines = ["# Per-move adjudication rollup", ""]
    lines.append(f"Actions in scope: {len(records)}")
    lines.append("")
    ni_sums = {f"NI-{i}": 0 for i in range(1, 7)}
    dipl_codes: list[str] = []
    glasl_path: list[str] = []
    for rec in records:
        aid = rec.get("action_id")
        tracks = rec.get("tracks") or {}
        gl = tracks.get("glasl") or {}
        if gl.get("stage_after") is not None:
            glasl_path.append(
                f"{aid}: {gl.get('stage_before')}→{gl.get('stage_after')} "
                f"(Δ{gl.get('delta'):+d})"
            )
        ni = tracks.get("national_interest") or {}
        for domain, entry in (ni.get("domain_deltas") or {}).items():
            ni_sums[domain] = ni_sums.get(domain, 0) + int(entry.get("delta") or 0)
        dipl = tracks.get("diplomacy") or {}
        if dipl.get("code_string"):
            dipl_codes.append(f"{aid}: `{dipl['code_string']}`")
    lines.append("## Glasl path")
    lines.extend([f"- {g}" for g in glasl_path] or ["- (none)"])
    lines.append("")
    lines.append("## NI domain sum (move)")
    for domain, total in ni_sums.items():
        lines.append(f"- {domain}: {total:+d}")
    lines.append("")
    lines.append("## Diplomacy index tally")
    lines.extend([f"- {c}" for c in dipl_codes] or ["- (none)"])
    lines.append("")
    return "\n".join(lines)
