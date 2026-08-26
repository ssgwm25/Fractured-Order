#!/usr/bin/env python3
"""Publish a fully reviewed Start Here audio batch and activate its manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
REVIEW_ROOT = REPOSITORY_ROOT / "scripts" / "start-here-audio" / "work" / "review"
PUBLIC_ROOT = REPOSITORY_ROOT / "public" / "onboarding" / "start-here" / "audio"
MANIFEST_PATH = REPOSITORY_ROOT / "src" / "features" / "onboarding" / "startHereAudioManifest.js"
REQUIRED_QUALITY_FIELDS = (
    "pronunciation",
    "pacing",
    "clippingFree",
    "pausesNatural",
    "prosodyAccepted",
    "profileMappingsComplete",
)


def fail(message: str) -> None:
    raise SystemExit(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_approval(approval: dict, review: dict) -> None:
    if approval.get("approved") is not True or approval.get("fullListenThrough") is not True:
        fail("Publication requires affirmative approval and a complete full-batch listen-through.")
    if approval.get("scriptBundleSha256") != review.get("scriptBundleSha256"):
        fail("Approval does not match the reviewed script bundle.")
    if approval.get("clipCount") != review.get("clipCount"):
        fail("Approval does not match the reviewed clip count.")
    if not approval.get("reviewer") or not approval.get("notes") or not approval.get("reviewedAt"):
        fail("Approval requires reviewer, reviewedAt, and notes.")
    try:
        datetime.fromisoformat(approval["reviewedAt"].replace("Z", "+00:00"))
    except (TypeError, ValueError):
        fail("Approval reviewedAt must be an ISO-8601 timestamp.")
    quality = approval.get("qualityReview") or {}
    if any(quality.get(field) is not True for field in REQUIRED_QUALITY_FIELDS):
        fail("Every Start Here quality-review item must be affirmative.")


def validate_review_files(review: dict) -> None:
    if review.get("status") != "pending-owner-full-listen-through":
        fail("Review index is missing or has an unexpected status.")
    clips = review.get("clips") or {}
    if len(clips) != review.get("clipCount"):
        fail("Review index clip count is inconsistent.")
    for clip_id, record in clips.items():
        media_path = REPOSITORY_ROOT / record["outputPath"]
        captions_path = REPOSITORY_ROOT / record["captionsPath"]
        if not media_path.is_file() or not captions_path.is_file():
            fail(f"Missing reviewed media for {clip_id}")
        if sha256_file(media_path) != record["outputSha256"]:
            fail(f"Reviewed media checksum mismatch for {clip_id}")


def write_runtime_manifest(review: dict) -> None:
    content_ids = sorted(clip_id.removeprefix("start-here.") for clip_id in review["clips"])
    clip_lines = "\n".join(f"        {json.dumps(content_id)}: true," for content_id in content_ids)
    source = f"""import {{ getFollowAlongAudioUrl, hashFollowAlongNarration }} from './audioGuide.js';

/** Generated from the owner-approved Start Here Kokoro batch. */
export const START_HERE_AUDIO_MANIFEST = Object.freeze({{
    status: 'approved',
    scriptBundleSha256: {json.dumps(review['scriptBundleSha256'])},
    clips: Object.freeze({{
{clip_lines}
    }})
}});

export function resolveApprovedStartHereAudioUrl(narration) {{
    const contentId = hashFollowAlongNarration(narration);
    if (
        START_HERE_AUDIO_MANIFEST.status !== 'approved'
        || START_HERE_AUDIO_MANIFEST.clips[contentId] !== true
    ) {{
        return null;
    }}
    return getFollowAlongAudioUrl(narration);
}}
"""
    MANIFEST_PATH.write_text(source, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--approval", type=Path, required=True)
    parser.add_argument("--scripts", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    review_path = REVIEW_ROOT / "review-index.json"
    if not review_path.is_file():
        fail("Generate the complete review batch before promotion.")
    if PUBLIC_ROOT.exists():
        fail(f"Publication target already exists; refusing to overwrite: {PUBLIC_ROOT}")
    review = json.loads(review_path.read_text(encoding="utf-8"))
    approval = json.loads(args.approval.read_text(encoding="utf-8"))
    scripts = json.loads(args.scripts.read_text(encoding="utf-8"))
    if scripts.get("scriptBundleSha256") != review.get("scriptBundleSha256"):
        fail("Script export does not match the generated review batch.")
    validate_review_files(review)
    validate_approval(approval, review)

    (PUBLIC_ROOT / "clips").mkdir(parents=True)
    (PUBLIC_ROOT / "captions").mkdir(parents=True)
    for record in review["clips"].values():
        shutil.copy2(REPOSITORY_ROOT / record["outputPath"], PUBLIC_ROOT / "clips" / record["filename"])
        caption_name = Path(record["captionsPath"]).name
        shutil.copy2(REPOSITORY_ROOT / record["captionsPath"], PUBLIC_ROOT / "captions" / caption_name)

    provenance = {
        **review,
        "status": "approved",
        "approval": approval,
    }
    (PUBLIC_ROOT / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    (PUBLIC_ROOT / "scripts.json").write_text(json.dumps(scripts, indent=2) + "\n", encoding="utf-8")
    write_runtime_manifest(review)
    print(f"Published and activated {review['clipCount']} owner-approved Start Here clips.")


if __name__ == "__main__":
    main()
