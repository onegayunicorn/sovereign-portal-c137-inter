"""CLI: run ORC-001 (Full Sovereign System Audit), print a JSON report and persist it.

Usage:
    python apps/soe-core/run_audit.py
    python apps/soe-core/run_audit.py --output sovereign_audit_results.json
    python apps/soe-core/run_audit.py --action ORC-005
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Optional

from soe_core import ORC_CATALOG, SovereignOrchestratorAgent

DEFAULT_OUTPUT = "sovereign_audit_results.json"


def run(action_id: str = "ORC-001", output: Optional[str] = DEFAULT_OUTPUT) -> Dict[str, Any]:
    soa = SovereignOrchestratorAgent()
    report = soa.execute_orc(action_id)
    report["audit_verification"] = soa.verify_merkle_chain()
    if output:
        path = Path(output)
        if not path.is_absolute():
            path = Path(__file__).resolve().parent / path
        path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        report["_report_path"] = str(path)
    return report


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(description="Sovereign Orchestrator Engine audit CLI")
    parser.add_argument("--action", default="ORC-001", choices=sorted(ORC_CATALOG), help="ORC action to run")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="JSON report path ('' to skip writing)")
    args = parser.parse_args(argv)

    report = run(action_id=args.action, output=args.output or None)
    print(json.dumps(report, indent=2, default=str))
    print(
        "\n[SOE] status={status} global_merkle_root={root}".format(
            status=report.get("status"), root=report.get("global_merkle_root")
        )
    )
    if report.get("_report_path"):
        print(f"[SOE] Report written to {report['_report_path']}")
    return 0


if __name__ == "__main__":  # pragma: no cover - manual entrypoint
    raise SystemExit(main())
