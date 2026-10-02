"""VoiceΩ (12th engine) tests — DSP core (numpy only) + lazy dependency guards.

The blueprint PART V verification script is reproduced in
``test_voice_omega_integration``.
"""

import importlib.util
import os

import numpy as np
import pytest

from soe_core import SovereignOrchestratorAgent
from voice_omega import (
    VoiceOmegaEngine,
    apply_personality,
    attach_to_orchestrator,
    build_podcast,
    generate_elevenlabs_audio,
    generate_podcast_audio,
    load_document_content,
    phase_vocoder,
    pitch_shift,
    warp_formants,
)


def _tone(freq=440.0, seconds=1.0, fs=8000):
    return np.sin(2 * np.pi * freq * np.linspace(0, seconds, int(fs * seconds)))


# --- core DSP (numpy + stdlib only) ---------------------------------------
def test_phase_vocoder_produces_finite_output():
    out = phase_vocoder(_tone(fs=8000), hop_a=512, hop_s=512, fft_size=512)
    assert len(out) > 0
    assert np.all(np.isfinite(out))


def test_phase_vocoder_stretch_length_scales_with_alpha():
    short = phase_vocoder(_tone(fs=8000), 512, 512, 512)
    long = phase_vocoder(_tone(fs=8000), 512, 1024, 512)
    assert len(long) > len(short)


def test_pitch_shift_preserves_duration_and_is_finite():
    signal = _tone(fs=8000)
    shifted = pitch_shift(signal, 3, 8000, fft_size=512)
    assert len(shifted) > 0
    assert abs(len(shifted) - len(signal)) <= 2
    assert np.all(np.isfinite(shifted))


def test_voice_omega_integration():
    # Reproduced verbatim from blueprint PART V.
    signal = np.sin(2 * np.pi * 440 * np.linspace(0, 1, 8000))
    shifted = pitch_shift(signal, 3, 8000, fft_size=512)
    assert len(shifted) > 0


def test_pitch_shift_raises_pitch_via_spectral_centroid():
    signal = _tone(freq=300.0, seconds=1.0, fs=8000)
    shifted = pitch_shift(signal, 12, 8000, fft_size=512)

    def centroid(x):
        spec = np.abs(np.fft.rfft(x))
        freqs = np.fft.rfftfreq(len(x), d=1.0 / 8000)
        return float(np.sum(freqs * spec) / np.sum(spec))

    assert centroid(shifted) > centroid(signal)


def test_warp_formants_preserves_shape():
    mag = np.abs(np.random.randn(513, 12)) + 1e-6
    warped = warp_formants(mag, 0.9)
    assert warped.shape == mag.shape
    assert np.all(np.isfinite(warped))


def test_palette_engine_constants():
    from voice_omega import VOICE_OMEGA_PROFILE

    assert VOICE_OMEGA_PROFILE["pitch_shift_factor"] == pytest.approx(0.92)
    assert VOICE_OMEGA_PROFILE["formant_beta"] == pytest.approx(0.95)


# --- document loader -------------------------------------------------------
def test_load_document_txt_and_md(tmp_path):
    txt = tmp_path / "doc.txt"
    txt.write_text("  Sovereign   portal\n C-137  ", encoding="utf-8")
    assert load_document_content(str(txt)) == "Sovereign portal C-137"

    md = tmp_path / "doc.md"
    md.write_text("# Heading\n\nBody text.", encoding="utf-8")
    assert load_document_content(str(md)) == "# Heading Body text."


def test_load_document_missing_file():
    with pytest.raises(FileNotFoundError):
        load_document_content("definitely_missing_12345.txt")


def test_load_document_unsupported_format(tmp_path):
    bad = tmp_path / "doc.xyz"
    bad.write_text("nope", encoding="utf-8")
    with pytest.raises(ValueError):
        load_document_content(str(bad))


# --- lazy heavy dependency guards -----------------------------------------
def test_apply_personality_runs_or_raises_runtime_error():
    if importlib.util.find_spec("librosa") is None:
        with pytest.raises(RuntimeError):
            apply_personality(_tone(), 8000, "host")
    else:  # pragma: no cover - depends on environment
        assert len(apply_personality(_tone(), 8000, "host")) > 0


def test_generate_podcast_audio_requires_openai():
    if importlib.util.find_spec("openai") is None:
        with pytest.raises(RuntimeError):
            generate_podcast_audio("hello")
    else:  # pragma: no cover - depends on environment
        if not os.getenv("OPENAI_API_KEY"):
            with pytest.raises(RuntimeError):
                generate_podcast_audio("hello")


def test_generate_elevenlabs_requires_requests():
    if importlib.util.find_spec("requests") is None:  # pragma: no cover - common install
        with pytest.raises(RuntimeError):
            generate_elevenlabs_audio("hello")


def test_build_podcast_requires_gtts_librosa_soundfile():
    missing = any(
        importlib.util.find_spec(name) is None for name in ("gtts", "librosa", "soundfile")
    )
    if missing:
        with pytest.raises(RuntimeError):
            build_podcast([("Host", "hi")])


# --- VOX merkle transitions ------------------------------------------------
def test_vox_002_commit_via_offline_transform():
    engine = VoiceOmegaEngine()
    out = engine.transform_offline(_tone(fs=8000), semitones=3, fs=8000, fft_size=512)
    assert len(out) > 0
    assert engine.history[-1].action_id == "VOX-002"
    assert engine.verifiable_chain()["valid"] is True


def test_vox_001_commit_with_monkeypatched_backend(monkeypatch):
    import voice_omega

    monkeypatch.setattr(voice_omega, "generate_podcast_audio", lambda text, output_file="x", voice="nova": output_file)
    engine = VoiceOmegaEngine()
    path = engine.synthesize("hello sovereign core")
    assert path
    assert engine.history[-1].action_id == "VOX-001"


def test_vox_003_commit_with_monkeypatched_backend(monkeypatch):
    import voice_omega

    monkeypatch.setattr(voice_omega, "build_podcast", lambda script, output_file="podcast.wav": output_file)
    engine = VoiceOmegaEngine()
    path = engine.mix_podcast([("Host", "hi"), ("Guest", "yo")])
    assert path
    assert engine.history[-1].action_id == "VOX-003"


def test_attach_to_orchestrator_registers_twelfth_engine():
    soa = SovereignOrchestratorAgent()
    engine = attach_to_orchestrator(soa)
    assert isinstance(engine, VoiceOmegaEngine)
    assert len(soa.engines) == 12
    engine.transform_offline(_tone(fs=8000), semitones=2, fs=8000, fft_size=512)
    assert soa.verify_merkle_chain()["valid"] is True
    assert len(soa.get_global_merkle_root()) == 64
