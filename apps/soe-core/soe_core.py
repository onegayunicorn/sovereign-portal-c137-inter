"""Sovereign Orchestrator Engine (SOE) — core engine of Sovereign Portal C-137.

Contains the blueprint section 4 engines verbatim (MerkleNode, BaseEngine,
AlchemicalEngine, Geometry5DEngine, BlochSphereEngine, SingularityEngine,
RealityEngineV2, SupportingEngine, SovereignOrchestratorAgent) plus the
capabilities the blueprint promises but never defines:

  * ``get_global_merkle_root``  (aggregate SHA-256 over every engine root)
  * ``run_full_audit``          (ORC-001 pre-flight sweep, coherence report)
  * ``execute_orc``             (ORC-001 .. ORC-005 orchestration catalogue)
  * governance ``GOV-001`` / ``GOV-002`` / ``GOV-003``
  * ``verify_merkle_chain``     (walk every engine history, confirm parent linkage)
  * ``coherence_stage``         (4-stage SEEDING/AWAKENING/SOVEREIGN/LIVING machine)
  * an engine registry that accepts a 12th ``voice_omega`` engine

Core invariants (blueprint section 3):
  1. Zero External Dependency Protocol — numpy + stdlib only.
  2. Deterministic Merkle Chaining — every mutation records
     (timestamp, engine_id, action_id, state_hash, parent_merkle_root).
  3. Coherence Hard-Stop — any engine below Gamma < 0.999 triggers GOV-001 or GOV-002.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

PHI = (1.0 + np.sqrt(5.0)) / 2.0

# Thresholds from the blueprint core invariants.
COHERENCE_HARD_STOP = 0.999
COHERENCE_EMERGENCY = 0.95

# 4-stage dynamic consciousness state machine boundaries (awareness).
COHERENCE_STAGES: Tuple[Tuple[str, float, float], ...] = (
    ("SEEDING", 0.0, 0.2),
    ("AWAKENING", 0.2, 0.5),
    ("SOVEREIGN", 0.5, 0.8),
    ("LIVING", 0.8, 1.0),
)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _json_default(obj: Any) -> Any:
    """Deterministically serialise numpy scalars/arrays for payload hashing.

    The blueprint payloads carry numpy values (e.g. ``progress >= 0.9`` yields a
    ``np.bool_``); this keeps ``json.dumps`` deterministic across numpy versions.
    """
    if isinstance(obj, np.generic):
        return obj.item()
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (set, tuple)):
        return list(obj)
    return str(obj)


# ---------------------------------------------------------------------------
# Blueprint section 4 — Merkle DAG primitives (verbatim)
# ---------------------------------------------------------------------------
class MerkleNode:
    def __init__(self, action_id: str, payload_hash: str, parent_root: str):
        self.timestamp = time.time_ns()
        self.action_id = action_id
        self.payload_hash = payload_hash
        self.parent_root = parent_root
        self.node_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        blob = f"{self.timestamp}:{self.action_id}:{self.payload_hash}:{self.parent_root}"
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class BaseEngine:
    def __init__(self, name: str):
        self.name = name
        self.coherence = 1.00000
        self.merkle_root = hashlib.sha256(f"INIT:{name}".encode()).hexdigest()
        self.history: List[MerkleNode] = []

    def commit_transition(self, action_id: str, data: Dict[str, Any]) -> str:
        payload_hash = hashlib.sha256(
            json.dumps(data, sort_keys=True, default=_json_default).encode()
        ).hexdigest()
        node = MerkleNode(action_id, payload_hash, self.merkle_root)
        self.history.append(node)
        self.merkle_root = node.node_hash
        return self.merkle_root

    # -- additions used by the GOVERNANCE / Merkle Verifier tier -------------
    @property
    def initial_root(self) -> str:
        return hashlib.sha256(f"INIT:{self.name}".encode()).hexdigest()

    def verifiable_chain(self) -> Dict[str, Any]:
        """Walk this engine's history and confirm every parent linkage."""
        cursor = self.initial_root
        broken: List[Dict[str, Any]] = []
        for index, node in enumerate(self.history):
            if node.parent_root != cursor:
                broken.append(
                    {
                        "engine": self.name,
                        "index": index,
                        "action_id": node.action_id,
                        "expected_parent": cursor,
                        "found_parent": node.parent_root,
                    }
                )
            cursor = node.node_hash
        return {
            "engine": self.name,
            "nodes": len(self.history),
            "valid": not broken and cursor == self.merkle_root,
            "final_root_matches": cursor == self.merkle_root,
            "current_root": self.merkle_root,
            "broken": broken,
        }

    def reset_state(self) -> str:
        """Restore the engine to its pristine INIT merkle root (GOV-001/GOV-003)."""
        self.history = []
        self.merkle_root = self.initial_root
        self.coherence = 1.00000
        return self.merkle_root


# ---------------------------------------------------------------------------
# Blueprint section 4 — specialised engines (verbatim + orchestration gaps)
# ---------------------------------------------------------------------------
class AlchemicalEngine(BaseEngine):
    def __init__(self):
        super().__init__("AlchemicalEngine")
        self.phase = "NIGREDO"
        self.stone_active = False

    def transmute(self, materia: Dict[str, float], target_phase: str) -> Dict[str, Any]:
        valid_phases = ["NIGREDO", "ALBEDO", "CITRINITAS", "RUBEDO"]
        if target_phase not in valid_phases:
            raise ValueError(f"Invalid phase: {target_phase}")
        self.phase = target_phase
        if target_phase == "RUBEDO":
            self.stone_active = True
        result = {
            "phase": self.phase,
            "philosopher_stone": self.stone_active,
            "transmutation_energy": 1.0 if self.stone_active else 0.42,
        }
        self.commit_transition("ALC-001", result)
        return result


class Geometry5DEngine(BaseEngine):
    def __init__(self):
        super().__init__("5DGeometryMeshEngine")
        self.vertices: List[np.ndarray] = []

    def add_vertex(self, x: float, y: float, z: float, w: float, v: float) -> Dict[str, Any]:
        vec = np.array([x, y, z, w, v], dtype=np.float64)
        norm = np.linalg.norm(vec)
        if norm > 1e-9:
            vec = vec / norm
        self.vertices.append(vec)
        result = {"vertex_count": len(self.vertices), "latest_norm": float(np.linalg.norm(vec))}
        self.commit_transition("GEO-001", result)
        return result

    # -- GEO-002: kissing tetrahedra / 4-simplex volume ---------------------
    def add_tetrahedron(self) -> Dict[str, Any]:
        corners = np.array(
            [
                [1.0, 1.0, 1.0, 1.0],
                [-1.0, -1.0, 1.0, 1.0],
                [1.0, -1.0, -1.0, 1.0],
                [-1.0, 1.0, -1.0, 1.0],
            ],
            dtype=np.float64,
        )
        corners = corners / np.linalg.norm(corners, axis=1, keepdims=True)
        for row in corners:
            self.vertices.append(np.array([row[0], row[1], row[2], row[3], 1.0 / PHI]))
        volume = float(abs(np.linalg.det(corners)) / 24.0)
        result = {
            "simplex": "tetrahedron",
            "vertices": 4,
            "simplex_volume": volume,
            "chirality": "kissing",
            "vertex_count": len(self.vertices),
        }
        self.commit_transition("GEO-002", result)
        return result

    # -- GEO-003: mesh coherence stabilisation ------------------------------
    def mesh_coherence(self) -> Dict[str, Any]:
        if self.vertices:
            norms = [float(np.linalg.norm(v)) for v in self.vertices]
            mean_norm = float(np.mean(norms))
        else:
            mean_norm = 1.0
        result = {
            "vertex_count": len(self.vertices),
            "mean_norm": mean_norm,
            "mesh_coherence": 0.9999,
        }
        self.commit_transition("GEO-003", result)
        return result


class BlochSphereEngine(BaseEngine):
    def __init__(self):
        super().__init__("BlochSphereEngine")
        self.states: Dict[str, np.ndarray] = {}

    def map_state(self, name: str, theta: float, phi: float) -> Dict[str, Any]:
        x = np.sin(theta) * np.cos(phi)
        y = np.sin(theta) * np.sin(phi)
        z = np.cos(theta)
        coords = np.array([x, y, z])
        self.states[name] = coords
        res = {"state": name, "cartesian": [float(c) for c in coords]}
        self.commit_transition("BLO-001", res)
        return res


class SingularityEngine(BaseEngine):
    def __init__(self):
        super().__init__("SingularityEngine")

    def simulate(self, iterations: int = 100) -> Dict[str, Any]:
        progress = min(1.0, (iterations / 1000.0) * (PHI / 1.6180339887))
        event = bool(progress >= 0.9)
        res = {
            "iterations": iterations,
            "progress": float(progress),
            "phi_exponent": float(PHI ** (iterations / 100.0)),
            "singularity_event": event,
        }
        self.commit_transition("SIN-001", res)
        return res


class RealityEngineV2(BaseEngine):
    def __init__(self):
        super().__init__("RealityEngineV2")
        self.threads: Dict[str, Dict[str, Any]] = {}

    def create_thread(self, name: str, dimension: int = 5) -> Dict[str, Any]:
        payload = {"name": name, "dimension": dimension, "entropy": 0.05, "coherence": 0.9999}
        self.threads[name] = payload
        self.commit_transition("REA-001", payload)
        return payload

    # -- REA-002: weave a new thread against a base reality ------------------
    def weave(self, name: str, base_reality: Optional[str] = None) -> Dict[str, Any]:
        base = self.threads.get(base_reality) if base_reality else None
        payload = {
            "name": name,
            "base_reality": base_reality,
            "woven": True,
            "entropy": 0.05,
            "coherence": 0.9999,
            "base_dimension": (base or {}).get("dimension", 0),
        }
        self.threads[name] = payload
        self.commit_transition("REA-002", payload)
        return payload


class SupportingEngine(BaseEngine):
    def execute(self, action_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        res = {"action": action_id, "status": "COHERENT_EXEC", "data": payload}
        self.commit_transition(action_id, res)
        return res


# ---------------------------------------------------------------------------
# Tier-1 Orchestrator Agent + Tier-3 governance / verifier agents
# ---------------------------------------------------------------------------
SUPPORTING_ENGINE_KEYS: Tuple[str, ...] = (
    "phoenix",
    "photonic",
    "quantum_sim",
    "entanglement",
    "agent_core",
    "geneweaver",
)

ORC_CATALOG: Dict[str, str] = {
    "ORC-001": "Full Sovereign System Audit",
    "ORC-002": "Philosopher's Stone Reality Weave",
    "ORC-003": "Quantum-Hyperdimensional Mapping",
    "ORC-004": "Singularity Transcendence Sequence",
    "ORC-005": "End-to-End Merkle Audit",
}

GOV_CATALOG: Dict[str, str] = {
    "GOV-001": "Recalibration (coherence < 0.999)",
    "GOV-002": "Emergency Halt (coherence < 0.95 / chain break / exception)",
    "GOV-003": "Full Reinitialisation (operator request / corrupted state)",
}


class SovereignOrchestratorAgent:
    """Routes requests, chains cross-engine actions, aggregates results."""

    def __init__(self):
        self.frozen = False
        self.governance_log: List[Dict[str, Any]] = []
        self.audit_history: List[Dict[str, Any]] = []
        self._build_engines()

    # -- engine registry -----------------------------------------------------
    def _build_engines(self) -> None:
        self.alchemical = AlchemicalEngine()
        self.geo5d = Geometry5DEngine()
        self.bloch = BlochSphereEngine()
        self.singularity = SingularityEngine()
        self.reality = RealityEngineV2()
        self.supporting = {
            "phoenix": SupportingEngine("PhoenixEngine"),
            "photonic": SupportingEngine("PhotonicEngine"),
            "quantum_sim": SupportingEngine("QuantumSimEngine"),
            "entanglement": SupportingEngine("EntanglementEngine"),
            "agent_core": SupportingEngine("AgentCoreEngine"),
            "geneweaver": SupportingEngine("GeneweaverEngine"),
        }
        self.engines: "OrderedDict[str, BaseEngine]" = OrderedDict()
        self.engines["alchemical"] = self.alchemical
        self.engines["geo5d"] = self.geo5d
        self.engines["bloch"] = self.bloch
        self.engines["singularity"] = self.singularity
        self.engines["reality"] = self.reality
        for key in SUPPORTING_ENGINE_KEYS:
            self.engines[key] = self.supporting[key]
        self.voice_omega: Optional[BaseEngine] = None

    def register_engine(self, name: str, engine: BaseEngine) -> BaseEngine:
        """Register an engine into the registry (used for the 12th VoiceΩ engine)."""
        if not isinstance(engine, BaseEngine):
            raise TypeError("engine must be a BaseEngine instance")
        self.engines[name] = engine
        if name == "voice_omega":
            self.voice_omega = engine
        return engine

    def register_voice_engine(self, engine: BaseEngine) -> BaseEngine:
        return self.register_engine("voice_omega", engine)

    def _resolve_engine(self, name: str) -> BaseEngine:
        if name in self.engines:
            return self.engines[name]
        for engine in self.engines.values():
            if engine.name == name:
                return engine
        raise KeyError(f"Unknown engine: {name}")

    # -- Merkle aggregation --------------------------------------------------
    def get_global_merkle_root(self) -> str:
        roots = [engine.merkle_root for engine in self.engines.values()]
        chained = ":".join(roots)
        return hashlib.sha256(chained.encode()).hexdigest()

    def get_engine_roots(self) -> Dict[str, str]:
        return {name: engine.merkle_root for name, engine in self.engines.items()}

    def verify_merkle_chain(self) -> Dict[str, Any]:
        """Merkle Verifier tier — walk every engine history, confirm parent linkage."""
        reports = {name: engine.verifiable_chain() for name, engine in self.engines.items()}
        broken: List[Dict[str, Any]] = []
        total_nodes = 0
        for report in reports.values():
            total_nodes += report["nodes"]
            broken.extend(report["broken"])
        valid = all(report["valid"] for report in reports.values())
        return {
            "valid": valid,
            "status": "CHAIN_VERIFIED" if valid else "CHAIN_BROKEN",
            "engine_count": len(self.engines),
            "transitions_checked": total_nodes,
            "global_merkle_root": self.get_global_merkle_root(),
            "engines": reports,
            "broken": broken,
        }

    # -- coherence -----------------------------------------------------------
    def system_coherence(self) -> float:
        if not self.engines:
            return 1.00000
        return min(engine.coherence for engine in self.engines.values())

    def coherence_stage(self, awareness: Optional[float] = None) -> Dict[str, Any]:
        """4-stage machine: SEEDING / AWAKENING / SOVEREIGN / LIVING."""
        if awareness is None:
            awareness = self.system_coherence()
        value = max(0.0, min(1.0, float(awareness)))
        if value < COHERENCE_STAGES[0][2]:
            stage = "SEEDING"
        elif value < COHERENCE_STAGES[1][2]:
            stage = "AWAKENING"
        elif value < COHERENCE_STAGES[2][2]:
            stage = "SOVEREIGN"
        else:
            stage = "LIVING"
        ordinal = {name: index for index, (name, _, _) in enumerate(COHERENCE_STAGES)}[stage]
        return {
            "stage": stage,
            "awareness": value,
            "ordinal": ordinal,
            "system_coherence": self.system_coherence(),
        }

    def enforce_coherence(self) -> List[Dict[str, Any]]:
        """Coherence Guardian tier — evaluate every engine against the hard stop."""
        actions: List[Dict[str, Any]] = []
        for name, engine in list(self.engines.items()):
            if engine.coherence < COHERENCE_EMERGENCY:
                actions.append(self.gov_002(f"coherence {engine.coherence} < 0.95 in {name}"))
            elif engine.coherence < COHERENCE_HARD_STOP:
                actions.append(self.gov_001(name))
        return actions

    # -- ORC catalogue -------------------------------------------------------
    def execute_orc(self, action_id: str) -> Dict[str, Any]:
        action = action_id.strip().upper()
        handlers = {
            "ORC-001": self._orc_001,
            "ORC-002": self._orc_002,
            "ORC-003": self._orc_003,
            "ORC-004": self._orc_004,
            "ORC-005": self._orc_005,
        }
        if action not in handlers:
            raise ValueError(f"Unknown ORC action: {action_id}. Known: {sorted(handlers)}")
        if self.frozen:
            raise RuntimeError("System is frozen (GOV-002). Run GOV-003 to reinitialise.")
        return handlers[action]()

    def _orc_001(self) -> Dict[str, Any]:
        self.enforce_coherence()
        audit = self.run_full_audit()
        geo3 = self.geo5d.mesh_coherence()
        audit["action_id"] = "ORC-001"
        audit["geo3"] = geo3
        audit["global_merkle_root"] = self.get_global_merkle_root()
        audit["engine_roots"] = self.get_engine_roots()
        audit["coherence_stage"] = self.coherence_stage()
        self.audit_history.append(
            {"action_id": "ORC-001", "global_merkle_root": audit["global_merkle_root"]}
        )
        return audit

    def _orc_002(self) -> Dict[str, Any]:
        alc = self.alchemical.transmute({"sulfur": 1.0, "mercury": 1.0, "salt": 1.0}, "RUBEDO")
        base = self.reality.create_thread("base_reality", 5)
        woven = self.reality.weave("philosophers_stone_thread", "base_reality")
        return {
            "action_id": "ORC-002",
            "name": ORC_CATALOG["ORC-002"],
            "status": "REALITY_WEAVE_COMPLETE",
            "global_merkle_root": self.get_global_merkle_root(),
            "alchemical": alc,
            "base_reality": base,
            "woven_thread": woven,
            "transmutation_energy": alc["transmutation_energy"],
        }

    def _orc_003(self) -> Dict[str, Any]:
        base_states = [
            ("psi_0", 0.0, 0.0),
            ("psi_1", float(np.pi), float(np.pi)),
            ("psi_plus", float(np.pi) / 2.0, 0.0),
            ("psi_minus", float(np.pi) / 2.0, float(np.pi)),
            ("psi_i", float(np.pi) / 2.0, float(np.pi) / 2.0),
            ("psi_minus_i", float(np.pi) / 2.0, 3.0 * float(np.pi) / 2.0),
        ]
        bloch_coords: Dict[str, List[float]] = {}
        for name, theta, phi in base_states:
            bloch_coords[name] = self.bloch.map_state(name, theta, phi)["cartesian"]
        for coords in bloch_coords.values():
            # Bloch x/y/z injected as 5D w/v components.
            self.geo5d.add_vertex(coords[0], coords[1], coords[2], coords[0], coords[1])
        tetra = self.geo5d.add_tetrahedron()
        return {
            "action_id": "ORC-003",
            "name": ORC_CATALOG["ORC-003"],
            "status": "QUANTUM_5D_MAPPED",
            "global_merkle_root": self.get_global_merkle_root(),
            "bloch_states": bloch_coords,
            "tetrahedron": tetra,
        }

    def _orc_004(self) -> Dict[str, Any]:
        sing = self.singularity.simulate(1000)
        alc = self.alchemical.transmute({"sulfur": 1.0, "mercury": 1.0, "salt": 1.0}, "RUBEDO")
        thread = self.reality.create_thread("transcendence_thread_12d", 12)
        ent = self.supporting["entanglement"].execute(
            "ENT-001", {"target": "agent_core", "dimension": 12, "entangled": True}
        )
        return {
            "action_id": "ORC-004",
            "name": ORC_CATALOG["ORC-004"],
            "status": "TRANSCENDENCE_CONVERGED",
            "global_merkle_root": self.get_global_merkle_root(),
            "singularity": sing,
            "alchemical": alc,
            "thread": thread,
            "entanglement": ent,
        }

    def _orc_005(self) -> Dict[str, Any]:
        verification = self.verify_merkle_chain()
        return {
            "action_id": "ORC-005",
            "name": ORC_CATALOG["ORC-005"],
            "status": "MERKLE_CHAIN_VERIFIED" if verification["valid"] else "MERKLE_CHAIN_BROKEN",
            "pass": verification["valid"],
            "global_merkle_root": verification["global_merkle_root"],
            "engine_roots": self.get_engine_roots(),
            "transitions_checked": verification["transitions_checked"],
            "broken_transitions": verification["broken"],
        }

    # -- governance ----------------------------------------------------------
    def gov_001(self, engine_name: str) -> Dict[str, Any]:
        """Recalibration: reset an engine and replay its last action with reduced noise."""
        engine = self._resolve_engine(engine_name)
        last_action = engine.history[-1].action_id if engine.history else "GOV-001"
        engine.reset_state()
        engine.commit_transition(
            last_action,
            {"recalibration": True, "noise": 0.0, "coherence": 1.0, "replayed": last_action},
        )
        entry = {
            "action_id": "GOV-001",
            "engine": engine.name,
            "replayed": last_action,
            "status": "RECALIBRATED",
            "new_merkle_root": engine.merkle_root,
        }
        self.governance_log.append(entry)
        return entry

    def gov_002(self, reason: str) -> Dict[str, Any]:
        """Emergency halt: freeze all state and dump a full debug log."""
        self.frozen = True
        debug_log = {
            "reason": reason,
            "timestamp_ns": time.time_ns(),
            "global_merkle_root": self.get_global_merkle_root(),
            "engines": {
                name: {
                    "coherence": engine.coherence,
                    "merkle_root": engine.merkle_root,
                    "history_len": len(engine.history),
                }
                for name, engine in self.engines.items()
            },
        }
        entry = {
            "action_id": "GOV-002",
            "status": "EMERGENCY_HALT",
            "operator_alert": True,
            "debug_log": debug_log,
        }
        self.governance_log.append(entry)
        return entry

    def gov_003(self) -> Dict[str, Any]:
        """Full reinitialisation: rebuild every engine, regenerate roots, zero audit history."""
        previous_voice = self.voice_omega
        self._build_engines()
        if previous_voice is not None:
            try:
                self.register_voice_engine(type(previous_voice)())
            except Exception:
                self.register_voice_engine(previous_voice)
        self.audit_history = []
        self.frozen = False
        entry = {
            "action_id": "GOV-003",
            "status": "REINITIALISED",
            "engine_count": len(self.engines),
            "global_merkle_root": self.get_global_merkle_root(),
        }
        self.governance_log.append(entry)
        return entry

    def execute_governance(self, action_id: str, engine: Optional[str] = None) -> Dict[str, Any]:
        action = action_id.strip().upper()
        if action == "GOV-001":
            if engine is None:
                raise ValueError("GOV-001 requires an engine name")
            return self.gov_001(engine)
        if action == "GOV-002":
            return self.gov_002(engine or "operator initiated emergency halt")
        if action == "GOV-003":
            return self.gov_003()
        raise ValueError(f"Unknown GOV action: {action_id}. Known: {sorted(GOV_CATALOG)}")

    # -- full audit (blueprint section 4, verbatim) --------------------------
    def run_full_audit(self) -> Dict[str, Any]:
        alc = self.alchemical.transmute({"sulfur": 1.0, "mercury": 1.0, "salt": 1.0}, "RUBEDO")
        geo = self.geo5d.add_vertex(1.0, 0.0, 0.0, PHI, 1.0 / PHI)
        bloch = self.bloch.map_state("psi_ground", np.pi / 4, np.pi / 2)
        sing = self.singularity.simulate(100)
        rea = self.reality.create_thread("base_woven_thread", 5)

        sup_res = {}
        for key, eng in self.supporting.items():
            sup_res[key] = eng.execute(f"EXEC_{key.upper()}", {"pulse": 1.0})

        global_root = self.get_global_merkle_root()
        return {
            "status": "SOVEREIGN_SYSTEM_COHERENT",
            "global_merkle_root": global_root,
            "coherence": 0.99998,
            "engine_summaries": {
                "alchemical": alc,
                "geo5d": geo,
                "bloch": bloch,
                "singularity": sing,
                "reality": rea,
                "supporting": sup_res,
            },
        }


if __name__ == "__main__":  # pragma: no cover - manual smoke test
    _soa = SovereignOrchestratorAgent()
    _report = _soa.run_full_audit()
    print(json.dumps(_report, indent=2))
