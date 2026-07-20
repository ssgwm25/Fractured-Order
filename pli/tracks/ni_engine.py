"""National Interest deterministic validator."""
from __future__ import annotations

from typing import Any

from tracks import DATA, TrackError

DOMAINS = list(DATA["national_interest"]["domains"].keys())
ALLOWED = set(DATA["national_interest"]["allowed_deltas"])
ALERT = DATA["national_interest"]["cross_domain_alert"]


def validate_ni_worksheet(
    worksheet: dict[str, Any],
    *,
    glasl_stage_after: int | None = None,
) -> dict[str, Any]:
    """Validate NI domain deltas and emit a traceable record."""
    if worksheet.get("needs_human"):
        return {
            "status": "needs_human",
            "needs_human_reason": worksheet.get("needs_human_reason"),
            "worksheet": worksheet,
            "domain_deltas": worksheet.get("domain_deltas"),
            "cross_domain_alert": False,
            "trace": ["needs_human flagged by agent"],
        }

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
        rationale = (entry.get("rationale") or "").strip()
        if len(rationale) < 8:
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
            "rationale": rationale,
            "vital_justification": entry.get("vital_justification"),
            "label": DATA["national_interest"]["domains"][domain],
        }

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

    return {
        "status": "pending",
        "orientation": worksheet.get("orientation"),
        "domain_deltas": normalized,
        "threat_cross_check": threat,
        "evidence_refs": worksheet.get("evidence_refs") or [],
        "cross_domain_alert": cross_alert,
        "trace": trace,
        "worksheet": worksheet,
    }
