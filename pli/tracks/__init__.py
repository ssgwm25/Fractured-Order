"""Shared loader for adjudication_data.json."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
DATA_PATH = HERE.parent / "codebook" / "adjudication_data.json"

with open(DATA_PATH, encoding="utf-8") as fh:
    DATA: dict[str, Any] = json.load(fh)


class TrackError(ValueError):
    """Worksheet violates a track codebook contract."""
