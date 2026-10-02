"""Sovereign Orchestrator Engine — blueprint section 6 tests + additions.

Covers: full audit merkle integrity, 5D norm preservation, alchemical stone
activation, Bloch unit-sphere mapping, Merkle-chain verification, the ORC
catalogue, governance GOV-001/002/003, the 4-stage coherence machine and the
12th VoiceΩ engine registration.
"""

import numpy as np
import pytest

from soe_core import PHI, ORC_CATALOG, SovereignOrchestratorAgent


# --- blueprint section 6 verbatim -----------------------------------------
def test_full_system_audit_merkle_integrity():
    soa = SovereignOrchestratorAgent()
    audit_results = soa.run_full_audit()
    assert audit_results["status"] == "SOVEREIGN_SYSTEM_COHERENT"
    assert audit_results["coherence"] >= 0.999
    assert len(audit_results["global_merkle_root"]) == 64


def test_5d_manifold_norm_preservation():
    soa = SovereignOrchestratorAgent()
    v = soa.geo5d.add_vertex(1.0, 2.0, 3.0, 4.0, 5.0)
    assert abs(v["latest_norm"] - 1.0) < 1e-6


def test_alchemical_stone_activation():
    soa = SovereignOrchestratorAgent()
    res = soa.alchemical.transmute({}, "RUBEDO")
    assert res["philosopher_stone"] is True
    assert res["transmutation_energy"] == 1.0


def test_bloch_state_on_unit_sphere():
    soa = SovereignOrchestratorAgent()
    res = soa.bloch.map_state("psi_ground", np.pi / 4, np.pi / 2)
    x, y, z = res["cartesian"]
    assert abs(x**2 + y**2 + z**2 - 1.0) < 1e-6


# --- golden-ratio / geometry additions -------------------------------------
def test_phi_constant_is_golden_ratio():
    assert abs(PHI - 1.6180339887) < 1e-9


def test_golden_ratio_entanglement_load():
    assert abs(5 * PHI**5 - 55.4508497) < 1e-4


def test_tetrahedron_simplex_volume_positive():
    soa = SovereignOrchestratorAgent()
    res = soa.geo5d.add_tetrahedron()
    assert res["simplex"] == "tetrahedron"
    assert res["simplex_volume"] > 0.0


# --- merkle chain ----------------------------------------------------------
def test_verify_merkle_chain_after_audit():
    soa = SovereignOrchestratorAgent()
    soa.run_full_audit()
    verification = soa.verify_merkle_chain()
    assert verification["valid"] is True
    assert verification["status"] == "CHAIN_VERIFIED"
    assert verification["transitions_checked"] > 0
    assert len(verification["global_merkle_root"]) == 64


def test_verify_merkle_chain_detects_break():
    soa = SovereignOrchestratorAgent()
    soa.run_full_audit()
    # Tamper with a recorded parent linkage -> the verifier must flag it.
    soa.alchemical.history[0].parent_root = "deadbeef" * 8
    verification = soa.verify_merkle_chain()
    assert verification["valid"] is False
    assert verification["broken"]


def test_global_merkle_root_is_stable_shape():
    soa = SovereignOrchestratorAgent()
    root = soa.get_global_merkle_root()
    assert len(root) == 64
    int(root, 16)  # valid hex


# --- ORC catalogue ---------------------------------------------------------
def test_orc_catalog_has_five_actions():
    assert set(ORC_CATALOG) == {"ORC-001", "ORC-002", "ORC-003", "ORC-004", "ORC-005"}


@pytest.mark.parametrize("action_id", sorted(ORC_CATALOG))
def test_execute_orc_catalogue(action_id):
    soa = SovereignOrchestratorAgent()
    result = soa.execute_orc(action_id)
    assert result["action_id"] == action_id
    assert len(result["global_merkle_root"]) == 64
    assert "status" in result


def test_orc_001_persists_engine_roots_and_stage():
    soa = SovereignOrchestratorAgent()
    result = soa.execute_orc("ORC-001")
    assert result["status"] == "SOVEREIGN_SYSTEM_COHERENT"
    assert result["geo3"]["mesh_coherence"] == 0.9999
    assert "alchemical" in result["engine_roots"]
    assert result["coherence_stage"]["stage"] in {"SEEDING", "AWAKENING", "SOVEREIGN", "LIVING"}


def test_orc_005_verifies_chain():
    soa = SovereignOrchestratorAgent()
    soa.execute_orc("ORC-001")
    result = soa.execute_orc("ORC-005")
    assert result["pass"] is True
    assert result["status"] == "MERKLE_CHAIN_VERIFIED"


def test_execute_orc_unknown_action():
    soa = SovereignOrchestratorAgent()
    with pytest.raises(ValueError):
        soa.execute_orc("ORC-999")


# --- coherence stage machine ----------------------------------------------
@pytest.mark.parametrize(
    "awareness,stage",
    [(0.0, "SEEDING"), (0.19, "SEEDING"), (0.2, "AWAKENING"), (0.49, "AWAKENING"),
     (0.5, "SOVEREIGN"), (0.79, "SOVEREIGN"), (0.8, "LIVING"), (1.0, "LIVING")],
)
def test_coherence_stage_boundaries(awareness, stage):
    soa = SovereignOrchestratorAgent()
    assert soa.coherence_stage(awareness)["stage"] == stage


def test_coherence_stage_defaults_to_living_at_full_coherence():
    soa = SovereignOrchestratorAgent()
    assert soa.coherence_stage()["stage"] == "LIVING"


# --- governance ------------------------------------------------------------
def test_gov_001_recalibration_restores_coherence():
    soa = SovereignOrchestratorAgent()
    soa.run_full_audit()
    soa.alchemical.coherence = 0.998
    entry = soa.gov_001("alchemical")
    assert entry["action_id"] == "GOV-001"
    assert soa.alchemical.coherence == 1.0
    assert soa.verify_merkle_chain()["valid"] is True


def test_enforce_coherence_triggers_gov_001():
    soa = SovereignOrchestratorAgent()
    soa.bloch.coherence = 0.998
    actions = soa.enforce_coherence()
    assert any(a["action_id"] == "GOV-001" for a in actions)


def test_gov_002_freezes_and_gov_003_reinitialises():
    soa = SovereignOrchestratorAgent()
    soa.run_full_audit()
    halt = soa.gov_002("test injection")
    assert halt["status"] == "EMERGENCY_HALT"
    assert soa.frozen is True
    assert halt["operator_alert"] is True
    with pytest.raises(RuntimeError):
        soa.execute_orc("ORC-001")
    reset = soa.gov_003()
    assert reset["status"] == "REINITIALISED"
    assert soa.frozen is False
    assert len(soa.engines) == 11
    assert soa.audit_history == []


def test_execute_governance_dispatch():
    soa = SovereignOrchestratorAgent()
    soa.alchemical.coherence = 0.99
    assert soa.execute_governance("GOV-001", "alchemical")["action_id"] == "GOV-001"
    assert soa.execute_governance("GOV-002", "manual")["action_id"] == "GOV-002"
    assert soa.execute_governance("GOV-003")["action_id"] == "GOV-003"


# --- 12th engine (VoiceΩ) registration ------------------------------------
def test_twelfth_engine_registration():
    from voice_omega import VoiceOmegaEngine

    soa = SovereignOrchestratorAgent()
    assert len(soa.engines) == 11
    engine = soa.register_voice_engine(VoiceOmegaEngine())
    assert soa.voice_omega is engine
    assert len(soa.engines) == 12
    assert len(soa.get_global_merkle_root()) == 64
    assert soa.verify_merkle_chain()["valid"] is True
