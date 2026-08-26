"""Pinned offline Kokoro helpers shared by the Start Here audio workflow."""

from __future__ import annotations

import hashlib
import re
from importlib import metadata
from pathlib import Path

EXPECTED_MODEL_REVISION = "8542409da2986c0ab5d41b3cf0411f7a58caab38"
EXPECTED_MODEL_SHA256 = "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4"
EXPECTED_SPACY_MODEL_VERSION = "3.8.0"
VOICE_ID = "af_heart"


def fail(message: str) -> None:
    raise SystemExit(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_generation_dependencies() -> tuple[object, object, object, object]:
    try:
        spacy_model_version = metadata.version("en-core-web-sm")
    except metadata.PackageNotFoundError:
        fail(
            "Missing pinned English phonemizer model: en-core-web-sm. "
            "Install the Start Here audio environment from its requirements file."
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
        fail(f"Missing Start Here audio dependency: {error.name or 'unknown'}.")
    return np, sf, KModel, KPipeline


def validate_model_directory(model_dir: Path) -> tuple[Path, Path, Path]:
    model_dir = model_dir.resolve()
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


def _timestamp(seconds: float) -> str:
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
            f"{_timestamp(cue['startSeconds'])} --> {_timestamp(cue['endSeconds'])}",
            cue["text"],
            "",
        ])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(body), encoding="utf-8")
    return normalized

