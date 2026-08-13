"""National Interest deterministic validator."""
from __future__ import annotations

from typing import Any

from tracks import DATA, TrackError

DOMAINS = list(DATA["national_interest"]["domains"].keys())
ALLOWED = set(DATA["national_interest"]["allowed_deltas"])
ALERT = DATA["national_interest"]["cross_domain_alert"]
ORIENTATION_PRIORS: dict[str, list[str]] = DATA["national_interest"]["orientation_priors"]
ORIENTATION_HORIZONS: dict[str, str] = DATA["national_interest"]["orientation_horizons"]
ORIENTATION_ALIGNMENTS = set(DATA["national_interest"]["orientation_alignments"])


def prior_domains(orientation: str) -> list[str]:
    key = (orientation or "").strip().lower()
    if key not in ORIENTATION_PRIORS:
        raise TrackError(f"Unknown NI orientation: {orientation!r}")
    return list(ORIENTATION_PRIORS[key])


def prior_horizon(orientation: str) -> str:
    key = (orientation or "").strip().lower()
    if key not in ORIENTATION_HORIZONS:
        raise TrackError(f"Unknown NI orientation: {orientation!r}")
    return ORIENTATION_HORIZONS[key]


def _normalize_domain_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(v).strip() for v in values]


def _orientation_net(normalized: dict[str, Any], primary: list[str]) -> int:
    return sum(int(normalized[d]["delta"]) for d in primary if d in normalized)


def validate_ni_worksheet(
    worksheet: dict[str, Any],
    *,
    glasl_stage_after: int | None = None,
    declared_orientation: str | None = None,
) -> dict[str, Any]:
    """Validate NI domain deltas and emit a traceable record."""
    if worksheet.get("needs_human"):
        return {
            "status": "needs_human",
            "needs_human_reason": worksheet.get("needs_human_reason"),
            "worksheet": worksheet,
            "domain_deltas": worksheet.get("domain_deltas"),
            "cross_domain_alert": False,
            "orientation": worksheet.get("orientation") or declared_orientation,
            "orientation_assessment": worksheet.get("orientation_assessment"),
            "orientation_net": None,
            "trace": ["needs_human flagged by agent"],
        }

    orientation = (worksheet.get("orientation") or declared_orientation or "").strip().lower()
    if orientation not in ORIENTATION_PRIORS:
        raise TrackError(f"Unknown NI orientation: {worksheet.get('orientation')!r}")
    if declared_orientation:
        declared = declared_orientation.strip().lower()
        if declared != orientation:
            raise TrackError(
                f"NI orientation {orientation!r} does not match intake {declared!r}"
            )

    expected_primary = prior_domains(orientation)
    expected_horizon = prior_horizon(orientation)

    assessment = worksheet.get("orientation_assessment")
    if not isinstance(assessment, dict):
        raise TrackError("NI worksheet missing orientation_assessment (Source 12)")

    alignment = (assessment.get("alignment") or "").strip().lower()
    if alignment not in ORIENTATION_ALIGNMENTS:
        raise TrackError(
            f"orientation_assessment.alignment {assessment.get('alignment')!r} "
            f"not in {sorted(ORIENTATION_ALIGNMENTS)}"
        )

    primary = _normalize_domain_list(assessment.get("primary_domains"))
    if primary != expected_primary:
        raise TrackError(
            f"orientation_assessment.primary_domains {primary} must equal "
            f"Source 12 prior {expected_primary} for {orientation}"
        )

    horizon = (assessment.get("effect_horizon") or "").strip().lower()
    if horizon != expected_horizon:
        raise TrackError(
            f"orientation_assessment.effect_horizon {horizon!r} must be "
            f"{expected_horizon!r} for {orientation}"
        )

    rationale = (assessment.get("rationale") or "").strip()
    if len(rationale) < 12:
        raise TrackError("orientation_assessment.rationale too short")

    domain_deltas = worksheet.get("domain_deltas")
    if not isinstance(domain_deltas, dict):
        raise TrackError("NI worksheet missing domain_deltas")

    normalized: dict[str, Any] = {}
    trace: list[str] = []
    any_negative = False

    for domain in DOMAINS:
        entry = domain_deltas.get(domain)
        if not isinstance(entry, dict):
            raise TrackError(f"Missing NI domain entry for {domain}")
        delta = entry.get("delta")
        if delta not in ALLOWED:
            raise TrackError(f"{domain} delta {delta!r} not in {sorted(ALLOWED)}")
        domain_rationale = (entry.get("rationale") or "").strip()
        if len(domain_rationale) < 8:
            raise TrackError(f"{domain} rationale too short")
        if abs(delta) == 2:
            vital = (entry.get("vital_justification") or "").strip()
            if len(vital) < 12:
                raise TrackError(
                    f"{domain} delta ±2 requires vital_justification (≥12 chars)"
                )
            trace.append(f"{domain}={delta:+d} vital: {vital}")
        else:
            trace.append(f"{domain}={delta:+d}")
        if delta <= -1:
            any_negative = True
        normalized[domain] = {
            "delta": delta,
            "rationale": domain_rationale,
            "vital_justification": entry.get("vital_justification"),
            "label": DATA["national_interest"]["domains"][domain],
            "primary": domain in expected_primary,
        }

    primary_deltas = [normalized[d]["delta"] for d in expected_primary]
    if alignment == "advances" and not any(d >= 1 for d in primary_deltas):
        raise TrackError(
            "alignment 'advances' requires at least one primary-domain delta ≥ +1"
        )
    if alignment == "contradicts" and not any(d <= -1 for d in primary_deltas):
        raise TrackError(
            "alignment 'contradicts' requires at least one primary-domain delta ≤ -1"
        )

    orientation_net = _orientation_net(normalized, expected_primary)
    trace.append(
        f"orientation={orientation} alignment={alignment} "
        f"horizon={horizon} primary={','.join(expected_primary)} "
        f"orientation_net={orientation_net:+d}"
    )

    threat = worksheet.get("threat_cross_check")
    if any_negative:
        if not isinstance(threat, dict):
            raise TrackError("threat_cross_check required when any domain delta ≤ -1")
        for key in ("capability", "will", "vulnerability"):
            if len(str(threat.get(key) or "").strip()) < 4:
                raise TrackError(f"threat_cross_check.{key} required")
        trace.append(
            "threat_cross_check: Capability × Will × Vulnerability recorded"
        )
    else:
        threat = None

    cross_alert = False
    if glasl_stage_after is not None:
        ni3 = normalized["NI-3"]["delta"]
        ni2 = normalized["NI-2"]["delta"]
        if (
            glasl_stage_after >= ALERT["min_glasl_stage"]
            and ni3 <= ALERT["ni3_max"]
            and ni2 >= ALERT["ni2_min"]
        ):
            cross_alert = True
            trace.append(
                "cross_domain_alert: high Glasl + NI-3− with NI-2+ "
                "(alliance credibility risk)"
            )

    normalized_assessment = {
        "alignment": alignment,
        "primary_domains": expected_primary,
        "effect_horizon": horizon,
        "rationale": rationale,
    }

    return {
        "status": "pending",
        "orientation": orientation,
        "orientation_assessment": normalized_assessment,
        "orientation_net": orientation_net,
        "domain_deltas": normalized,
        "threat_cross_check": threat,
        "evidence_refs": worksheet.get("evidence_refs") or [],
        "cross_domain_alert": cross_alert,
        "trace": trace,
        "worksheet": worksheet,
    }
