#!/usr/bin/env python3
"""Generate review samples or an owner-approved Kokoro narration batch offline."""

from __future__ import annotations

import argparse
import hashlib
from importlib import metadata
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PROVENANCE_PATH = REPOSITORY_ROOT / "public" / "training" / "audio" / "provenance.json"
SOURCE_PROVENANCE_PATH = REPOSITORY_ROOT / "src" / "features" / "training" / "audioProvenance.json"
WORK_ROOT = REPOSITORY_ROOT / "scripts" / "training-audio" / "work"
EXPECTED_MODEL_REVISION = "8542409da2986c0ab5d41b3cf0411f7a58caab38"
EXPECTED_MODEL_SHA256 = "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4"
EXPECTED_SPACY_MODEL_VERSION = "3.8.0"
VOICE_ID = "af_heart"
SAMPLE_IDS = (
    "training.intro",
    "training.v1.scribe.blue.orient",
    "training.v1.facilitator.blue.show",
    "training.v1.notetaker.blue.guide",
)
PER_FILE_BUDGET = 256 * 1024
TOTAL_BUDGET = 12 * 1024 * 1024


def load_generation_dependencies() -> tuple[object, object, object, object]:
    try:
        spacy_model_version = metadata.version("en-core-web-sm")
    except metadata.PackageNotFoundError:
        fail(
            "Missing pinned English phonemizer model: en-core-web-sm. "
            "Install the complete offline generation environment with: "
            "python -m pip install -r scripts/training-audio/requirements.txt"
        )
    if spacy_model_version != EXPECTED_SPACY_MODEL_VERSION:
        fail(
            "English phonemizer model version mismatch: expected "
            f"{EXPECTED_SPACY_MODEL_VERSION}, found {spacy_model_version}."
        )
    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KModel, KPipeline
    except ModuleNotFoundError as error:
        missing = error.name or "an unknown package"
        fail(
            f"Missing training-audio dependency: {missing}. "
            "Use Python 3.10-3.12 and install the pinned environment with: "
            "python -m pip install -r scripts/training-audio/requirements.txt"
        )
    return np, sf, KModel, KPipeline


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fail(message: str) -> None:
    raise SystemExit(message)


def require_offline_environment() -> None:
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"


def validate_model_directory(model_dir: Path) -> tuple[Path, Path, Path]:
    model_dir = model_dir.resolve()
    try:
        model_dir.relative_to(REPOSITORY_ROOT)
    except ValueError:
        pass
    else:
        fail("Keep Kokoro model weights outside the repository.")

    config_path = model_dir / "config.json"
    model_path = model_dir / "kokoro-v1_0.pth"
    voice_path = model_dir / "voices" / f"{VOICE_ID}.pt"
    for required in (config_path, model_path, voice_path):
        if not required.is_file():
            fail(f"Missing required local model artifact: {required}")
    actual_hash = sha256_file(model_path)
    if actual_hash != EXPECTED_MODEL_SHA256:
        fail(f"Model checksum mismatch: expected {EXPECTED_MODEL_SHA256}, found {actual_hash}")
    return config_path, model_path, voice_path


def load_scripts(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("entries")
    if (
        payload.get("schemaVersion") != 1
        or payload.get("curriculumVersion") != "1.0"
        or not isinstance(entries, list)
        or len(entries) != 97
    ):
        fail("The narration script export is missing or invalid.")
    if len({entry.get("id") for entry in entries}) != len(entries):
        fail("The narration script export contains duplicate clip IDs.")
    for entry in entries:
        actual = hashlib.sha256(entry["text"].encode("utf-8")).hexdigest()
        if actual != entry.get("scriptSha256"):
            fail(f"Script checksum mismatch for {entry.get('id', '<unknown>')}")
    canonical = "\n".join(f"{entry['id']}\0{entry['text']}" for entry in entries)
    bundle_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if bundle_hash != payload.get("scriptBundleSha256"):
        fail("The narration script bundle checksum is invalid.")
    return payload


def validate_approval(path: Path | None, scripts: dict) -> dict:
    if path is None or not path.is_file():
        fail("Bulk generation requires the completed owner approval file.")
    approval = json.loads(path.read_text(encoding="utf-8"))
    required = ("reviewer", "reviewedAt", "notes")
    if approval.get("approved") is not True:
        fail("Owner approval is not affirmative.")
    if approval.get("voiceId") != VOICE_ID:
        fail("Owner approval does not match the selected voice.")
    if approval.get("modelRevision") != EXPECTED_MODEL_REVISION:
        fail("Owner approval does not match the pinned model revision.")
    if approval.get("scriptBundleSha256") != scripts.get("scriptBundleSha256"):
        fail("Owner approval does not match this script bundle.")
    if approval.get("sampleMeasurementsReviewed") is not True:
        fail("Owner approval must confirm that sample media measurements were reviewed.")
    if approval.get("perFileBudgetBytes") != PER_FILE_BUDGET:
        fail("Owner approval does not match the per-file media budget.")
    if approval.get("totalBudgetBytes") != TOTAL_BUDGET:
        fail("Owner approval does not match the total media budget.")
    if any(not approval.get(field) for field in required):
        fail("Owner approval is missing reviewer, review time, or notes.")
    try:
        datetime.fromisoformat(approval["reviewedAt"].replace("Z", "+00:00"))
    except (TypeError, ValueError):
        fail("Owner approval reviewedAt must be an ISO-8601 timestamp.")
    return approval


def slug(clip_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", clip_id.lower()).strip("-")


def token_cues(results: list, gap_seconds: float = 0.16) -> list[dict]:
    cues: list[dict] = []
    group: list = []
    offset = 0.0

    def flush() -> None:
        nonlocal group
        if not group:
            return
        text = "".join(f"{token.text}{token.whitespace or ''}" for token in group).strip()
        if text:
            cues.append({
                "startSeconds": round(offset + float(group[0].start_ts or 0), 3),
                "endSeconds": round(offset + float(group[-1].end_ts or 0), 3),
                "text": text,
            })
        group = []

    for result in results:
        for token in result.tokens or []:
            if token.start_ts is None or token.end_ts is None or not token.text:
                continue
            group.append(token)
            span = float(group[-1].end_ts or 0) - float(group[0].start_ts or 0)
            if len(group) >= 10 or span >= 4.0 or re.search(r"[.!?;:]$", token.text):
                flush()
        flush()
        offset += (len(result.audio) / 24000.0) + gap_seconds
    return cues


def synthesize(pipeline: object, text: str, voice_path: Path, raw_path: Path, np: object, sf: object) -> list[dict]:
    results = [result for result in pipeline(text, voice=str(voice_path), speed=1.0) if result.audio is not None]
    if not results:
        fail("Kokoro returned no audio.")
    gap = np.zeros(int(24000 * 0.16), dtype=np.float32)
    segments: list = []
    for index, result in enumerate(results):
        if index:
            segments.append(gap)
        segments.append(result.audio.detach().cpu().numpy().astype(np.float32))
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(raw_path, np.concatenate(segments), 24000, subtype="PCM_24")
    return token_cues(results)


def parse_loudnorm(stderr: str) -> dict:
    candidates = re.findall(r"\{\s*\"input_i\".*?\}", stderr, flags=re.DOTALL)
    if not candidates:
        fail("ffmpeg did not return loudness measurements.")
    return json.loads(candidates[-1])


def master_audio(raw_path: Path, output_path: Path, ffmpeg: str) -> None:
    first_pass = subprocess.run(
        [
            ffmpeg, "-hide_banner", "-nostdin", "-i", str(raw_path),
            "-af", "loudnorm=I=-18:TP=-2:LRA=7:print_format=json",
            "-f", "null", "-",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    measured = parse_loudnorm(first_pass.stderr)
    filter_value = (
        "aresample=48000,"
        "loudnorm=I=-18:TP=-2:LRA=7:linear=true:print_format=summary:"
        f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
        f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg, "-hide_banner", "-nostdin", "-y", "-i", str(raw_path),
            "-af", filter_value, "-ac", "1", "-ar", "48000",
            "-c:a", "libmp3lame", "-b:a", "64k", str(output_path),
        ],
        check=True,
    )


def probe_duration(path: Path, ffprobe: str) -> float:
    result = subprocess.run(
        [
            ffprobe, "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(result.stdout.strip()), 3)


def timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d}.{milliseconds:03d}"


def write_vtt(path: Path, cues: list[dict], duration: float, fallback_text: str) -> list[dict]:
    if not cues:
        cues = [{"startSeconds": 0.0, "endSeconds": duration, "text": fallback_text}]
    normalized = []
    for cue in cues:
        start = min(max(float(cue["startSeconds"]), 0.0), duration)
        end = min(max(float(cue["endSeconds"]), start + 0.05), duration)
        normalized.append({
            "startSeconds": round(start, 3),
            "endSeconds": round(end, 3),
            "text": str(cue["text"]).replace("-->", "→"),
        })
    body = ["WEBVTT", ""]
    for cue in normalized:
        body.extend([
            f"{timestamp(cue['startSeconds'])} --> {timestamp(cue['endSeconds'])}",
            cue["text"],
            "",
        ])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(body), encoding="utf-8")
    return normalized


def generate_clip(
    pipeline: object,
    entry: dict,
    voice_path: Path,
    destination: Path,
    ffmpeg: str,
    ffprobe: str,
    np: object,
    sf: object,
) -> dict:
    filename = slug(entry["id"])
    raw_path = WORK_ROOT / "raw" / f"{filename}.wav"
    output_path = destination / "clips" / f"{filename}.mp3"
    captions_path = destination / "captions" / f"{filename}.en.vtt"
    cues = synthesize(pipeline, entry["text"], voice_path, raw_path, np, sf)
    master_audio(raw_path, output_path, ffmpeg)
    duration = probe_duration(output_path, ffprobe)
    cues = write_vtt(captions_path, cues, duration, entry["text"])
    return {
        "id": entry["id"],
        "scriptSha256": entry["scriptSha256"],
        "outputPath": output_path,
        "captionsPath": captions_path,
        "durationSeconds": duration,
        "byteLength": output_path.stat().st_size,
        "outputSha256": sha256_file(output_path),
        "cues": cues,
    }


def relative_public_path(path: Path) -> str:
    return path.relative_to(REPOSITORY_ROOT / "public").as_posix()


def write_review_index(records: list[dict], scripts: dict, voice_path: Path) -> None:
    payload = {
        "status": "pending-owner-review",
        "modelRevision": EXPECTED_MODEL_REVISION,
        "voiceId": VOICE_ID,
        "voiceFileSha256": sha256_file(voice_path),
        "scriptBundleSha256": scripts["scriptBundleSha256"],
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "measurements": {
            "largestSampleBytes": max(record["byteLength"] for record in records),
            "sampleTotalBytes": sum(record["byteLength"] for record in records),
            "projectedUpperBoundBytes": max(record["byteLength"] for record in records) * 97,
            "perFileBudgetBytes": PER_FILE_BUDGET,
            "totalBudgetBytes": TOTAL_BUDGET,
        },
        "clips": [{**record, "outputPath": str(record["outputPath"]), "captionsPath": str(record["captionsPath"])} for record in records],
    }
    (WORK_ROOT / "review-index.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def finalize_provenance(records: list[dict], scripts: dict, approval: dict, voice_path: Path) -> None:
    total_bytes = sum(record["byteLength"] for record in records)
    oversized = [record["id"] for record in records if record["byteLength"] > PER_FILE_BUDGET]
    if oversized:
        fail(f"Per-file media budget exceeded: {', '.join(oversized)}")
    if total_bytes > TOTAL_BUDGET:
        fail(f"Total media budget exceeded: {total_bytes} > {TOTAL_BUDGET}")

    provenance = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    provenance["generationDate"] = generated_at
    provenance["scriptBundleSha256"] = scripts["scriptBundleSha256"]
    provenance["voice"]["voiceFileSha256"] = sha256_file(voice_path)
    provenance["mediaBudget"] = {
        "perFileBytes": PER_FILE_BUDGET,
        "totalBytes": TOTAL_BUDGET,
        "status": "approved-from-sample-measurement",
        "sampleMeasurementsReviewed": True,
        "actualTotalBytes": total_bytes,
        "largestFileBytes": max(record["byteLength"] for record in records),
        "clipCount": len(records),
    }
    provenance["approval"] = {
        "status": "approved",
        "scope": "sample-set",
        "owner": approval["reviewer"],
        "reviewedAt": approval["reviewedAt"],
        "notes": approval["notes"],
        "fullListenThrough": False,
        "clipCount": len(SAMPLE_IDS),
        "checklistPath": "scripts/training-audio/README.md",
    }
    provenance["clips"] = {
        record["id"]: {
            "scriptSha256": record["scriptSha256"],
            "outputPath": relative_public_path(record["outputPath"]),
            "captionsPath": relative_public_path(record["captionsPath"]),
            "durationSeconds": record["durationSeconds"],
            "byteLength": record["byteLength"],
            "outputSha256": record["outputSha256"],
            "approvalStatus": "approved",
            "cues": record["cues"],
        }
        for record in records
    }
    serialized = json.dumps(provenance, indent=2) + "\n"
    PROVENANCE_PATH.write_text(serialized, encoding="utf-8")
    SOURCE_PROVENANCE_PATH.write_text(serialized, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("samples", "all"))
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--scripts", type=Path, required=True)
    parser.add_argument("--approval", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    require_offline_environment()
    for executable in (args.ffmpeg, args.ffprobe):
        if shutil.which(executable) is None:
            fail(f"Required executable not found: {executable}")

    scripts = load_scripts(args.scripts.resolve())
    approval = validate_approval(args.approval, scripts) if args.mode == "all" else None
    config_path, model_path, voice_path = validate_model_directory(args.model_dir)
    np, sf, KModel, KPipeline = load_generation_dependencies()
    model = KModel(
        repo_id="hexgrad/Kokoro-82M",
        config=str(config_path),
        model=str(model_path),
    ).to("cpu").eval()
    pipeline = KPipeline(
        lang_code="a",
        repo_id="hexgrad/Kokoro-82M",
        model=model,
        device="cpu",
    )

    entries = scripts["entries"]
    if args.mode == "samples":
        selected = [entry for entry in entries if entry["id"] in SAMPLE_IDS]
        if {entry["id"] for entry in selected} != set(SAMPLE_IDS):
            fail("The script export does not contain all four required approval samples.")
        destination = WORK_ROOT / "review"
    else:
        selected = entries
        destination = REPOSITORY_ROOT / "public" / "training" / "audio"

    records = [
        generate_clip(pipeline, entry, voice_path, destination, args.ffmpeg, args.ffprobe, np, sf)
        for entry in selected
    ]
    if args.mode == "samples":
        write_review_index(records, scripts, voice_path)
        print(f"Generated {len(records)} local review samples. Bulk generation remains blocked.")
    else:
        finalize_provenance(records, scripts, approval, voice_path)
        print(f"Generated and recorded {len(records)} approved narration clips.")


if __name__ == "__main__":
    main()
