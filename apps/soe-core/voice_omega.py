"""VoiceΩ — Voice Synchronization & Tone Scaling Module (blueprint section 8).

Runs as the 12th Merkle-chained engine (``voice_omega``).  The DSP core
(``phase_vocoder`` / ``pitch_shift``) depends on **numpy + the standard library
only** so it works under the Zero External Dependency Protocol.  Every heavier
dependency (librosa, soundfile, openai, PyPDF2, python-docx, gtts, requests) is
imported lazily inside the functions that need it and raises a clear
``RuntimeError`` when the package is missing.

Merkle transitions:
    VOX-001  Synthesize       (neural TTS)
    VOX-002  Transform Voice  (pitch / formant / personality)
    VOX-003  Mix Podcast      (multi-speaker document-to-podcast)
"""

from __future__ import annotations

import os
from io import BytesIO
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from soe_core import BaseEngine

# VoiceΩ SOVEREIGN profile (blueprint section 8.8).
VOICE_OMEGA_PROFILE: Dict[str, Any] = {
    "name": "SOVEREIGN",
    "pitch_shift_factor": 0.92,   # S_p
    "formant_beta": 0.95,         # beta (beta < 1 enlarges the vocal tract)
    "speech_rate_rho": 1.15,      # high rho
    "burp_probability": 0.066,
}

# Personality / prosody profiles (blueprint section 8.6).
PERSONALITY_PROFILES: Dict[str, Dict[str, float]] = {
    "host": {"pitch_center": 110.0, "speech_rate": 140.0, "semitones": -3.0, "rate": 0.95, "formant_shift": 0.9},
    "guest": {"pitch_center": 165.0, "speech_rate": 170.0, "semitones": 2.0, "rate": 1.1, "formant_shift": 1.1},
}


def _require(module_name: str, pip_name: Optional[str] = None) -> Any:
    """Lazily import an optional dependency, raising a clear RuntimeError."""
    try:
        return __import__(module_name)
    except ImportError as exc:  # pragma: no cover - depends on environment
        package = pip_name or module_name
        raise RuntimeError(
            f"VoiceΩ optional dependency '{package}' is not installed. "
            f"Install it with:  pip install {package}"
        ) from exc


# ---------------------------------------------------------------------------
# 8.5 — Core DSP (numpy + stdlib only)
# ---------------------------------------------------------------------------
def phase_vocoder(signal, hop_a, hop_s, fft_size):
    """Time-stretches a signal by a factor alpha = hop_s / hop_a."""
    signal = np.asarray(signal, dtype=np.float64)
    window = np.hanning(fft_size)
    frames = np.array(
        [np.fft.rfft(window * signal[i:i + fft_size]) for i in range(0, len(signal) - fft_size, hop_a)]
    )
    if len(frames) == 0:
        return np.zeros(0, dtype=np.float64)

    magnitudes = np.abs(frames)
    phases = np.angle(frames)

    syn_phase = phases[0]
    output_frames = np.zeros_like(frames, dtype=np.complex128)
    output_frames[0] = magnitudes[0] * np.exp(1j * syn_phase)

    for m in range(1, len(frames)):
        delta_phi = phases[m] - phases[m - 1]
        expected_delta = 2 * np.pi * np.arange(frames.shape[1]) * hop_a / fft_size
        dev = delta_phi - expected_delta
        wrapped_dev = (dev + np.pi) % (2 * np.pi) - np.pi
        inst_freq = (2 * np.pi * np.arange(frames.shape[1]) / fft_size) + (wrapped_dev / hop_a)
        syn_phase += hop_s * inst_freq
        output_frames[m] = magnitudes[m] * np.exp(1j * syn_phase)

    # ISTFT synthesis (Overlap-Add)
    res_len = int(len(frames) * hop_s + fft_size)
    res = np.zeros(res_len)
    for m, frame in enumerate(output_frames):
        res[m * hop_s: m * hop_s + fft_size] += window * np.fft.irfft(frame)
    return res


def pitch_shift(signal, semitones, fs, fft_size=2048):
    """Shifts the pitch of a signal by a given number of semitones (numpy only)."""
    signal = np.asarray(signal, dtype=np.float64)
    s_p = 2 ** (semitones / 12.0)
    hop_a = 512
    hop_s = int(hop_a * s_p)

    stretched = phase_vocoder(signal, hop_a, hop_s, fft_size)
    if len(stretched) == 0:
        return np.zeros(0, dtype=np.float64)

    indices = np.arange(0, len(signal)) * s_p
    indices = indices[indices < len(stretched)]
    shifted = np.interp(indices, np.arange(len(stretched)), stretched)
    return shifted


def warp_formants(magnitude, formant_shift: float):
    """Formant warping: E'(w) = E(w / S_f)  (blueprint section 8.4)."""
    magnitude = np.asarray(magnitude, dtype=np.float64)
    freqs = np.linspace(0, 1, magnitude.shape[0])
    warped_freqs = freqs / formant_shift
    mag_warped = np.zeros_like(magnitude)
    for i in range(magnitude.shape[1]):
        mag_warped[:, i] = np.interp(freqs, warped_freqs, magnitude[:, i])
    return mag_warped


def apply_personality(audio, sr, personality_type="host"):
    """Modifies audio via personality profiles: tempo, pitch, and formants."""
    librosa = _require("librosa")
    if personality_type == "host":
        n_steps, rate, formant_shift = -3, 0.95, 0.9
    else:
        n_steps, rate, formant_shift = 2, 1.1, 1.1

    audio_tsm = librosa.effects.time_stretch(np.asarray(audio, dtype=np.float32), rate=rate)
    audio_pitch = librosa.effects.pitch_shift(audio_tsm, sr=sr, n_steps=n_steps)

    stft = librosa.stft(audio_pitch)
    mag, phase = librosa.magphase(stft)
    mag_warped = warp_formants(mag, formant_shift)
    return librosa.istft(mag_warped * phase)


# ---------------------------------------------------------------------------
# 8.7 — Document-to-podcast pipeline
# ---------------------------------------------------------------------------
def load_document_content(file_path):
    """Extracts text from PDF, DOCX, TXT, or MD files."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File {file_path} does not exist.")
    content = ""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        PyPDF2 = _require("PyPDF2")
        with open(file_path, "rb") as f:
            for page in PyPDF2.PdfReader(f).pages:
                content += (page.extract_text() or "") + "\n"
    elif ext == ".docx":
        docx = _require("docx", "python-docx")
        for para in docx.Document(file_path).paragraphs:
            content += para.text + "\n"
    elif ext in (".txt", ".md"):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    else:
        raise ValueError("Unsupported format: use PDF, DOCX, TXT, or MD.")
    return " ".join(content.split())


def generate_podcast_audio(script_text, output_file="episode_001.mp3", voice="nova"):
    """Neural TTS with a young, fluent English voice (OpenAI 'nova')."""
    openai_mod = _require("openai")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set; cannot reach the OpenAI TTS backend.")
    client = openai_mod.OpenAI(api_key=api_key)
    response = client.audio.speech.create(
        model="tts-1", voice=voice, input=script_text, speed=1.0
    )
    response.stream_to_file(output_file)
    return output_file


def generate_elevenlabs_audio(script_text, output_file="episode_001_elite.mp3"):
    """Alternative ElevenLabs TTS backend (output_format goes in the URL query string)."""
    requests = _require("requests")
    url = "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL?output_format=mp3_44100_128"
    headers = {
        "xi-api-key": os.getenv("ELEVENLABS_API_KEY", ""),
        "Content-Type": "application/json",
    }
    data = {
        "text": script_text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.5,
            "use_speaker_boost": True,
            "speed": 1.0,
        },
    }
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()
    with open(output_file, "wb") as f:
        f.write(response.content)
    return output_file


def transform_voice(audio, sr, semitones):
    """Optimized phase-vocoder pitch shift via librosa."""
    librosa = _require("librosa")
    return librosa.effects.pitch_shift(np.asarray(audio, dtype=np.float32), sr=sr, n_steps=semitones)


def build_podcast(script, output_file="podcast.wav"):
    """Two-person podcast: differentiated voices with pauses."""
    librosa = _require("librosa")
    sf = _require("soundfile")
    gtts_mod = _require("gtts")
    final_audio, sample_rate = [], 22050
    for speaker, text in script:
        tts_bytes = BytesIO()
        gtts_mod.gTTS(text=text, lang="en").write_to_fp(tts_bytes)
        tts_bytes.seek(0)
        data, sr = librosa.load(tts_bytes, sr=sample_rate)
        if speaker == "Host":
            processed = transform_voice(data, sr, semitones=-2)
        else:
            processed = transform_voice(data, sr, semitones=3)
        final_audio.append(processed)
        final_audio.append(np.zeros(int(sr * 0.5)))
    sf.write(output_file, np.concatenate(final_audio), sample_rate)
    return output_file


# ---------------------------------------------------------------------------
# 12th engine — VoiceΩ in the Merkle chain
# ---------------------------------------------------------------------------
class VoiceOmegaEngine(BaseEngine):
    """VoiceΩ registered as the 12th Merkle-chained engine."""

    def __init__(self, profile: str = "SOVEREIGN"):
        super().__init__("VoiceOmegaEngine")
        self.profile = profile
        self.profile_params = dict(VOICE_OMEGA_PROFILE)

    def synthesize(self, text: str, output_file: str = "episode_001.mp3", voice: str = "nova") -> str:
        path = generate_podcast_audio(text, output_file=output_file, voice=voice)
        self.commit_transition(
            "VOX-001",
            {"output": output_file, "voice": voice, "characters": len(text), "backend": "openai-tts-1"},
        )
        return path

    def synthesize_elevenlabs(self, text: str, output_file: str = "episode_001_elite.mp3") -> str:
        path = generate_elevenlabs_audio(text, output_file=output_file)
        self.commit_transition(
            "VOX-001",
            {"output": output_file, "characters": len(text), "backend": "elevenlabs"},
        )
        return path

    def transform_audio(self, audio, sr: int, semitones: float) -> np.ndarray:
        out = transform_voice(audio, sr, semitones)
        self.commit_transition(
            "VOX-002",
            {"semitones": float(semitones), "samples": int(len(out)), "mode": "librosa"},
        )
        return out

    def transform_offline(self, audio, semitones: float, fs: int, fft_size: int = 2048) -> np.ndarray:
        out = pitch_shift(audio, semitones, fs, fft_size=fft_size)
        self.commit_transition(
            "VOX-002",
            {"semitones": float(semitones), "samples": int(len(out)), "mode": "numpy-phase-vocoder"},
        )
        return out

    def mix_podcast(self, script: Sequence[Tuple[str, str]], output_file: str = "podcast.wav") -> str:
        path = build_podcast(script, output_file=output_file)
        self.commit_transition(
            "VOX-003",
            {"output": output_file, "turns": len(list(script)), "mode": "gtts+librosa"},
        )
        return path


def attach_to_orchestrator(soa, profile: str = "SOVEREIGN") -> VoiceOmegaEngine:
    """Create + register VoiceΩ as the orchestrator's 12th engine."""
    engine = VoiceOmegaEngine(profile=profile)
    soa.register_voice_engine(engine)
    return engine


__all__ = [
    "VOICE_OMEGA_PROFILE",
    "PERSONALITY_PROFILES",
    "phase_vocoder",
    "pitch_shift",
    "warp_formants",
    "apply_personality",
    "load_document_content",
    "generate_podcast_audio",
    "generate_elevenlabs_audio",
    "transform_voice",
    "build_podcast",
    "VoiceOmegaEngine",
    "attach_to_orchestrator",
]
