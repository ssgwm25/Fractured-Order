#!/usr/bin/env python3
"""Generate the complete Start Here Kokoro batch for local owner review."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

import kokoro_helpers

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
WORK_ROOT = REPOSITORY_ROOT / "scripts" / "start-here-audio" / "work"
REVIEW_ROOT = WORK_ROOT / "review"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_scripts(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("entries")
    if payload.get("schemaVersion") != 1 or payload.get("experienceVersion") != "start-here-1.0":
        raise SystemExit("Unsupported Start Here script-bundle schema.")
    if not isinstance(entries, list) or payload.get("clipCount") != len(entries) or not entries:
        raise SystemExit("Start Here script bundle has an invalid clip count.")
    if len({entry.get("id") for entry in entries}) != len(entries):
        raise SystemExit("Start Here script bundle contains duplicate clip IDs.")
    for entry in entries:
        expected = hashlib.sha256(entry["text"].encode("utf-8")).hexdigest()
        if expected != entry.get("scriptSha256"):
            raise SystemExit(f"Script checksum mismatch for {entry.get('id', '<unknown>')}")
    canonical = "\n".join(f"{entry['id']}\0{entry['text']}" for entry in entries)
    bundle_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if bundle_hash != payload.get("scriptBundleSha256"):
        raise SystemExit("Start Here script-bundle checksum is invalid.")
    return payload


def resample_linear(samples, source_rate: int, target_rate: int, np):
    if source_rate == target_rate or len(samples) == 0:
        return samples
    target_length = round(len(samples) * target_rate / source_rate)
    source_positions = np.arange(len(samples), dtype=np.float64)
    target_positions = np.linspace(0, len(samples) - 1, target_length, dtype=np.float64)
    return np.interp(target_positions, source_positions, samples).astype(np.float32)


def peak_normalize(samples, np, target_dbfs: float = -2.0):
    peak = float(np.max(np.abs(samples))) if len(samples) else 0.0
    if peak <= 0.0:
        return samples
    target_peak = math.pow(10.0, target_dbfs / 20.0)
    return (samples * min(target_peak / peak, 1.0)).astype(np.float32)


def synthesize_clip(pipeline, entry: dict, voice_path: Path, np, sf, helpers) -> dict:
    results = [result for result in pipeline(entry["text"], voice=str(voice_path), speed=1.0) if result.audio is not None]
    if not results:
        raise SystemExit(f"Kokoro returned no audio for {entry['id']}")

    gap = np.zeros(int(24000 * 0.16), dtype=np.float32)
    segments = []
    for index, result in enumerate(results):
        if index:
            segments.append(gap)
        segments.append(result.audio.detach().cpu().numpy().astype(np.float32))
    samples = peak_normalize(resample_linear(np.concatenate(segments), 24000, 48000, np), np)

    stem = entry["filename"].removesuffix(".mp3")
    output_path = REVIEW_ROOT / "clips" / f"{stem}.mp3"
    captions_path = REVIEW_ROOT / "captions" / f"{stem}.en.vtt"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    captions_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(
        output_path,
        samples,
        48000,
        format="MP3",
        subtype="MPEG_LAYER_III",
        compression_level=0.75,
        bitrate_mode="CONSTANT",
    )
    duration = round(len(samples) / 48000.0, 3)
    cues = helpers.write_vtt(captions_path, helpers.token_cues(results), duration, entry["text"])
    return {
        "id": entry["id"],
        "filename": entry["filename"],
        "scriptSha256": entry["scriptSha256"],
        "outputPath": str(output_path.relative_to(REPOSITORY_ROOT)).replace("\\", "/"),
        "captionsPath": str(captions_path.relative_to(REPOSITORY_ROOT)).replace("\\", "/"),
        "durationSeconds": duration,
        "byteLength": output_path.stat().st_size,
        "outputSha256": sha256_file(output_path),
        "cues": cues,
    }


def write_review_index(records: list[dict], scripts: dict, helpers, voice_path: Path) -> None:
    payload = {
        "schemaVersion": 1,
        "experienceVersion": scripts["experienceVersion"],
        "status": "pending-owner-full-listen-through",
        "generatedVoiceDisclosure": scripts["generatedVoiceDisclosure"],
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "engine": {
            "name": "kokoro",
            "version": "0.9.4",
            "license": "Apache-2.0",
        },
        "model": {
            "name": "hexgrad/Kokoro-82M",
            "revision": helpers.EXPECTED_MODEL_REVISION,
            "modelSha256": helpers.EXPECTED_MODEL_SHA256,
            "license": "Apache-2.0",
        },
        "voice": {
            "id": helpers.VOICE_ID,
            "voiceFileSha256": sha256_file(voice_path),
        },
        "settings": {
            "synthesisSampleRateHz": 24000,
            "deliverySampleRateHz": 48000,
            "channels": 1,
            "speed": 1.0,
            "peakNormalizationDbfs": -2.0,
            "format": "audio/mpeg",
            "encoder": "libsndfile",
            "compressionLevel": 0.75,
            "bitrateMode": "CONSTANT",
        },
        "scriptBundleSha256": scripts["scriptBundleSha256"],
        "profileCount": scripts["profileCount"],
        "slideReferenceCount": scripts["slideReferenceCount"],
        "clipCount": len(records),
        "totalBytes": sum(record["byteLength"] for record in records),
        "largestFileBytes": max(record["byteLength"] for record in records),
        "approval": {
            "status": "pending",
            "fullListenThrough": False,
            "checklistPath": "scripts/start-here-audio/README.md",
        },
        "profiles": scripts["profiles"],
        "clips": {record["id"]: record for record in records},
    }
    REVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    (REVIEW_ROOT / "review-index.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def prune_stale_review_files(records: list[dict]) -> None:
    expected_clips = {record["filename"] for record in records}
    expected_captions = {Path(record["captionsPath"]).name for record in records}
    for path in (REVIEW_ROOT / "clips").glob("*.mp3"):
        if path.name not in expected_clips:
            path.unlink()
    for path in (REVIEW_ROOT / "captions").glob("*.en.vtt"):
        if path.name not in expected_captions:
            path.unlink()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--scripts", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    helpers = kokoro_helpers
    scripts = load_scripts(args.scripts.resolve())
    config_path, model_path, voice_path = helpers.validate_model_directory(args.model_dir)
    np, sf, KModel, KPipeline = helpers.load_generation_dependencies()
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

    records = []
    total = len(scripts["entries"])
    for index, entry in enumerate(scripts["entries"], start=1):
        record = synthesize_clip(pipeline, entry, voice_path, np, sf, helpers)
        records.append(record)
        print(f"[{index}/{total}] {entry['id']} ({record['durationSeconds']:.1f}s)", flush=True)
    prune_stale_review_files(records)
    write_review_index(records, scripts, helpers, voice_path)
    print(
        f"Generated {len(records)} Kokoro review clips for {scripts['slideReferenceCount']} Start Here slides. "
        "Publication remains blocked pending the owner full listen-through.",
        flush=True,
    )


if __name__ == "__main__":
    main()
