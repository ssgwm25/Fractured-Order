"""Windows compatibility shim for cursor-sdk's sync bridge launcher.

cursor-sdk 0.1.8 reads the bridge subprocess's discovery line by registering
the stderr pipe with ``selectors.DefaultSelector`` and calling
``select.select``. On Windows ``select`` only accepts sockets, so every
bridge launch fails with ``OSError: [WinError 10038]``. This module replaces
``cursor_sdk._bridge._read_discovery`` with a thread-based reader that works
on any platform. It is a no-op on non-Windows systems, so the GitHub Actions
(Linux) path keeps using the stock SDK code.

Remove once the upstream SDK ships a Windows-safe launcher.
"""
from __future__ import annotations

import os
import queue
import subprocess
import threading
import time
from typing import Any, Mapping


def apply() -> None:
    if os.name != "nt":
        return

    from cursor_sdk import _bridge

    CursorSDKError = _bridge.CursorSDKError

    def _read_discovery_windows(
        process: "subprocess.Popen[str]", timeout: float
    ) -> Mapping[str, Any]:
        if process.stderr is None:
            raise CursorSDKError("Bridge process stderr is unavailable")

        lines: "queue.Queue[str | None]" = queue.Queue()

        def pump() -> None:
            # Keep draining stderr for the life of the bridge so the pipe
            # never fills; discovery only needs the first matching line.
            try:
                for line in process.stderr:  # type: ignore[union-attr]
                    lines.put(line)
            except (ValueError, OSError):
                pass  # pipe closed during shutdown
            finally:
                lines.put(None)

        threading.Thread(target=pump, daemon=True, name="cursor-bridge-stderr").start()

        seen: list[str] = []
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CursorSDKError("Timed out waiting for bridge discovery")
            try:
                line = lines.get(timeout=min(0.1, remaining))
            except queue.Empty:
                if process.poll() is not None and lines.empty():
                    raise CursorSDKError(
                        f"Bridge exited before discovery with status {process.poll()}: "
                        + "".join(seen)
                    )
                continue
            if line is None:
                exit_code = process.poll()
                raise CursorSDKError(
                    f"Bridge exited before discovery with status {exit_code}: "
                    + "".join(seen)
                )
            seen.append(line)
            discovery = _bridge.parse_discovery_line(line)
            if discovery is not None:
                return discovery

    _bridge._read_discovery = _read_discovery_windows
