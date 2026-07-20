"""Regenerate per-action, per-move, and per-simulation reports from adjudications/."""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

from reports.generate_action_report import write_action_report  # noqa: E402
from reports.generate_move_report import load_records, write_move_report  # noqa: E402
from reports.generate_simulation_report import write_simulation_report  # noqa: E402


def main() -> int:
    adj_dir = ROOT / "adjudications"
    all_records = []
    for path in sorted(adj_dir.glob("*.json")):
        if path.name.startswith("_"):
            continue
        rec = json.loads(path.read_text(encoding="utf-8"))
        all_records.append(rec)
        write_action_report(rec)

    moves = sorted(
        {
            int((r.get("action") or {}).get("move") or 0)
            for r in all_records
            if (r.get("action") or {}).get("move")
        }
    )
    for move in moves:
        write_move_report(load_records(adj_dir, move=move), move)

    write_simulation_report(all_records)
    print(f"Regenerated reports for {len(all_records)} actions, moves={moves}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
