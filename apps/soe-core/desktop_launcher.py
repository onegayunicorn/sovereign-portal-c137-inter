"""Sovereign Portal C-137 — desktop entrypoint (frozen into SovereignPortalC137.exe).

Starts the SOE gateway in a background thread, waits for ``/health``, opens the
default browser at the portal, and prints the ASCII banner.

Flags:
    --no-browser   do not open a browser (headless / kiosk / CI)
    --port PORT    bind port (default 8000)
    --audit        run ORC-001, print the JSON report, exit (no server)

PyInstaller awareness: the bundled website is located through ``resolve_web_root``
which checks ``sys._MEIPASS/web`` first for one-file builds.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import List, Optional

# ---------------------------------------------------------------------------
# PyInstaller --windowed builds have no console: sys.stdout / sys.stderr are
# None. uvicorn's default logging config attaches a StreamHandler to
# `ext://sys.stdout`, and `logging` itself falls back to sys.stderr when a
# stream is missing, so every log emit would raise inside the handler. Rebinding
# the streams to a null writer before anything else is imported keeps windowed
# builds fully functional.
# ---------------------------------------------------------------------------
if sys.stdout is None or sys.stderr is None:  # pragma: no cover - frozen only
    _null = open(os.devnull, "w", encoding="utf-8")
    if sys.stdout is None:
        sys.stdout = _null
    if sys.stderr is None:
        sys.stderr = _null

BANNER = r"""
  ______                 _               ______           __        ______ ______ ______
 / __/ /  _____ _ _____ _(_)__ ____ ____ / __/ /  ___  ___/ /__ ____/ / / //_/  _/__  /
_\ \/ _ \/ __/ // / _ `/ / _ `/ -_)___// _// _ \/ _ \/ _  / -_) __/ /_/ ,<  / /   /_ <
/___/_//_/\__/\_,_/\_,_/_/\_, /\__/   /_/ /_//_/\___/\_,_/\__/_/  \____/|_| /___/___(_)
                         /___/                                    S O V E R E I G N
                    Sovereign Portal C-137  •  Dimension C-137  •  1207 Hz
"""


def resolve_web_root() -> Optional[Path]:
    """Locate the served website directory, checking in order:

      1. ``sys._MEIPASS/web``
      2. ``<cwd>/web``
      3. ``<cwd>/../../dist/website``
      4. ``<exe dir>/web``
    """
    candidates: List[Path] = []

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "web")

    cwd = Path.cwd()
    candidates.append(cwd / "web")
    candidates.append(cwd / ".." / ".." / "dist" / "website")

    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
    else:
        exe_dir = Path(__file__).resolve().parent
    candidates.append(exe_dir / "web")

    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.is_dir():
            return resolved
    return None


def _wait_for_health(port: int, timeout: float = 30.0) -> bool:
    url = f"http://127.0.0.1:{port}/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0) as response:
                if response.status == 200:
                    return True
        except (urllib.error.URLError, OSError):
            time.sleep(0.25)
    return False


def run_audit() -> int:
    from soe_core import SovereignOrchestratorAgent

    soa = SovereignOrchestratorAgent()
    report = soa.execute_orc("ORC-001")
    print(json.dumps(report, indent=2, default=str))
    print(f"\n[SOE] status={report['status']} root={report['global_merkle_root']}")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Sovereign Portal C-137 desktop launcher")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    parser.add_argument("--port", type=int, default=8000, help="gateway bind port (default 8000)")
    parser.add_argument("--audit", action="store_true", help="run ORC-001 and exit")
    args = parser.parse_args(argv)

    print(BANNER)

    if args.audit:
        return run_audit()

    web_root = resolve_web_root()
    if web_root is not None:
        print(f"[SOE] Serving portal assets from: {web_root}")
    else:
        print("[SOE] No built portal found; serving the gateway fallback page at '/'.")

    import uvicorn

    from gateway import app

    config = uvicorn.Config(app, host="127.0.0.1", port=args.port, log_level="info")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="soe-gateway", daemon=True)
    thread.start()

    print(f"[SOE] Waiting for gateway on 127.0.0.1:{args.port} ...")
    if not _wait_for_health(args.port):
        print("[SOE] WARNING: gateway did not report healthy within 30s.", file=sys.stderr)
    else:
        print("[SOE] Gateway healthy. Merkle chain online.")

    url = f"http://127.0.0.1:{args.port}/"
    if not args.no_browser:
        try:
            webbrowser.open(url)
            print(f"[SOE] Opened {url}")
        except Exception as exc:  # pragma: no cover - platform dependent
            print(f"[SOE] Could not open a browser automatically: {exc}")
    print(f"[SOE] Portal available at {url}  (Ctrl+C to shut down)")

    try:
        while thread.is_alive():
            thread.join(timeout=1.0)
    except KeyboardInterrupt:
        print("\n[SOE] Shutdown requested. Closing Merkle chain ...")
        server.should_exit = True
        thread.join(timeout=5.0)
    return 0


if __name__ == "__main__":  # pragma: no cover - manual entrypoint
    raise SystemExit(main())
