import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Reticle, ScanlineFilter, TelemetryCard, TerminalPrompt, WaveformBar } from '@portal/hud-overlay-system';
import type { TerminalLine } from '@portal/hud-overlay-system';
import { parseTimelineVtt, VideoSyncEngine } from '@portal/video-engine';
import type { TimelineCue } from '@portal/video-engine';
import { SovereignAIEngine } from '@portal/offline-ai';
import { MatrixRainCanvas } from './components/MatrixRainCanvas';
import { InstallPwaBanner } from './components/InstallPwaBanner';
import { useAudioReactor } from './hooks/useAudioReactor';
import { useGist } from './hooks/useGist';
import { parseAIOutputMarkup } from './lib/semantic-mapper';
import { Convert } from './routes/Convert';

/* ========================================================================== */
/* Constants                                                                  */
/* ========================================================================== */

const DIMENSION_CODE = 'C-137';
const RESONANCE_HZ = 1207;
const STABILITY_LABEL = '99.87%';

const SYSTEM_PROMPT = [
  "You are the Rick C-137 Sovereign Portal Orchestrator AI.",
  'Speak concisely, cynically and scientifically.',
  'Embed gesture tags such as <gesture name="point_ui" targetX="75" targetY="40" />',
  'and emotion tags such as <emotion name="smug" intensity="0.8" /> inline.',
].join(' ');

/** Fallback cue manifest — replaced by `/timeline.vtt` when it is reachable. */
const FALLBACK_CUES: TimelineCue[] = [
  {
    id: 'boot-telemetry',
    start: 0,
    end: 4,
    type: 'telemetry_ping',
    coordinates: { x: 50, y: 12 },
    payload: { label: 'BOOT HANDSHAKE', dimensionCode: DIMENSION_CODE, meta: { resonanceHz: RESONANCE_HZ } },
  },
  {
    id: 'hud-reticle',
    start: 4,
    end: 12,
    type: 'hotspot',
    coordinates: { x: 38, y: 44 },
    payload: { label: 'SCAN CALIBRATION LENS', dimensionCode: DIMENSION_CODE },
  },
  {
    id: 'fluid-chamber',
    start: 12,
    end: 20,
    type: 'hotspot',
    coordinates: { x: 71, y: 52 },
    payload: { label: 'SCAN PORTAL FLUID', dimensionCode: DIMENSION_CODE },
  },
  {
    id: 'drift-warning',
    start: 20,
    end: 28,
    type: 'telemetry_ping',
    coordinates: { x: 50, y: 14 },
    payload: { label: 'FLUX DECAY WARNING', meta: { statusFlag: 'MONITOR' } },
  },
  {
    id: 'branch-j19z7',
    start: 28,
    end: 40,
    type: 'branch_choice',
    coordinates: { x: 50, y: 82 },
    payload: { label: 'DIMENSIONAL CHOICE POINT', dimensionCode: 'J-19Z7', seekTarget: 41.5 },
  },
  {
    id: 'cv-track-rift',
    start: 40,
    end: 48,
    type: 'cv_track',
    coordinates: { x: 46, y: 38 },
    payload: {
      label: 'RIFT TRACK',
      confidence: 0.94,
      box: { x: 46, y: 38, width: 10, height: 18 },
    },
  },
  {
    id: 'structure-stable',
    start: 48,
    end: 60,
    type: 'telemetry_ping',
    coordinates: { x: 50, y: 12 },
    payload: { label: 'STRUCTURE STABLE', meta: { statusFlag: 'ACTIVE' } },
  },
];

type OrchestratorTone = 'online' | 'testing' | 'degraded' | 'collapsed';

/* ========================================================================== */
/* Video stage                                                                */
/* ========================================================================== */

interface VideoStageProps {
  onCue: (cue: TimelineCue) => void;
}

const VideoStage: React.FC<VideoStageProps> = ({ onCue }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VideoSyncEngine | null>(null);
  const [cues, setCues] = useState<TimelineCue[]>(FALLBACK_CUES);
  const [mediaTime, setMediaTime] = useState(0);
  const [videoAvailable, setVideoAvailable] = useState(true);

  // Load the WebVTT manifest when it is served; otherwise keep the fallback.
  useEffect(() => {
    let cancelled = false;
    fetch('/timeline.vtt')
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error('vtt unavailable'))))
      .then((text) => {
        if (cancelled) return;
        const parsed = parseTimelineVtt(text);
        if (parsed.length > 0) {
          setCues(
            parsed.map((cue) => ({
              id: cue.id,
              start: cue.start,
              end: cue.end,
              type: cue.type,
              coordinates: cue.coordinates,
              payload: cue.payload as TimelineCue['payload'],
            })),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    const engine = new VideoSyncEngine(video, overlay, cues);
    engineRef.current = engine;

    const unsubscribe = engine.onCue((cue, time) => {
      setMediaTime(time);
      onCue(cue);
    });

    const poll = window.setInterval(() => {
      setMediaTime(engine.getCurrentTime());
    }, 250);

    return () => {
      window.clearInterval(poll);
      unsubscribe();
      engine.destroy();
      engineRef.current = null;
    };
  }, [cues, onCue]);

  return (
    <div className="portal-video-stage">
      {videoAvailable ? (
        <video
          ref={videoRef}
          className="portal-video-stage__video"
          src="/media/portal-stream.mp4"
          playsInline
          autoPlay
          muted
          loop
          crossOrigin="anonymous"
          onError={() => setVideoAvailable(false)}
        />
      ) : (
        <div className="portal-video-stage__void">
          <span>NO STREAM SIGNAL</span>
          <small>Drop an mp4 at /public/media/portal-stream.mp4</small>
        </div>
      )}

      <div ref={overlayRef} className="portal-video-stage__overlay" />

      <div className="portal-video-stage__readout">
        <span>T: {mediaTime.toFixed(2)}s</span>
        <span>•</span>
        <span>{cues.length} CUES</span>
        <span>•</span>
        <span>{videoAvailable ? 'STREAM LOCKED' : 'VOID'}</span>
      </div>
    </div>
  );
};

/* ========================================================================== */
/* App                                                                        */
/* ========================================================================== */

export const App: React.FC = () => {
  const [route, setRoute] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/convert') ? 'convert' : 'portal',
  );

  const [orchestratorTone, setOrchestratorTone] = useState<OrchestratorTone>('online');
  const [firing, setFiring] = useState(false);
  const [resonanceHz, setResonanceHz] = useState(RESONANCE_HZ);
  const [pinned, setPinned] = useState<TerminalLine | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [command, setCommand] = useState('');
  const [thinking, setThinking] = useState(false);
  const [gistNotice, setGistNotice] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());

  const [log, setLog] = useState<TerminalLine[]>([
    { id: 'boot-1', kind: 'prompt', text: 'Sovereign Portal C-137 boot sequence initiated.' },
    { id: 'boot-2', kind: 'output', text: 'Orchestrator online. Dimension lock acquired: C-137.' },
  ]);

  const engineRef = useRef<SovereignAIEngine | null>(null);
  const logIdRef = useRef(0);

  const audio = useAudioReactor({ syntheticFrequencyHz: RESONANCE_HZ });
  const gist = useGist();

  const pushLog = useCallback((line: Omit<TerminalLine, 'id'>) => {
    logIdRef.current += 1;
    setLog((previous) => [...previous.slice(-120), { ...line, id: `log-${logIdRef.current}` }]);
  }, []);

  // Wall clock for the telemetry header.
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the URL in sync with the internal route (no router dependency).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = route === 'convert' ? '/convert' : '/';
    if (window.location.pathname !== target) {
      window.history.pushState({ route }, '', target);
    }
  }, [route]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname.startsWith('/convert') ? 'convert' : 'portal');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleCue = useCallback(
    (cue: TimelineCue) => {
      if (cue.type !== 'telemetry_ping') return;
      pushLog({
        kind: 'output',
        text: `[CUE] ${cue.payload.label ?? cue.id} · ${JSON.stringify(cue.payload.meta ?? {})}`,
      });
    },
    [pushLog],
  );

  /* ------------------------------------------------------------- actions -- */

  const handleFire = useCallback(() => {
    setFiring(true);
    pushLog({ kind: 'prompt', text: 'Portal gun discharge authorised.' });
    window.setTimeout(() => setFiring(false), 900);
  }, [pushLog]);

  const handlePin = useCallback(() => {
    const lastAssistant = [...log].reverse().find((line) => line.kind === 'output' || line.kind === 'prompt');
    if (!lastAssistant) {
      pushLog({ kind: 'warning', text: 'Nothing to pin — orchestrator buffer empty.' });
      return;
    }
    setPinned(lastAssistant);
    pushLog({ kind: 'output', text: 'Orchestrator readout pinned to the HUD.' });
  }, [log, pushLog]);

  const handleRetest = useCallback(() => {
    setOrchestratorTone('testing');
    pushLog({ kind: 'prompt', text: 'Re-running portal structural test…' });
    window.setTimeout(() => {
      setOrchestratorTone('online');
      pushLog({
        kind: 'output',
        text: "Portal test complete. Structure stable. You're clear to proceed.",
      });
    }, 1400);
  }, [pushLog]);

  const handleRecalibrate = useCallback(() => {
    setResonanceHz(RESONANCE_HZ);
    audio.startSynthetic();
    pushLog({
      kind: 'output',
      text: `Resonance array recalibrated to ${RESONANCE_HZ} Hz. Stability ${STABILITY_LABEL}.`,
    });
  }, [audio, pushLog]);

  const handleCollapse = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      setOrchestratorTone(next ? 'collapsed' : 'online');
      return next;
    });
  }, []);

  const handleGist = useCallback(async () => {
    const result = await gist.exportPortalState({
      dimension: DIMENSION_CODE,
      resonance: resonanceHz,
      stability: 0.9987,
      orchestratorLogs: log.slice(-40).map((line) => ({
        actor: line.kind === 'prompt' ? 'USER' : 'ORCHESTRATOR',
        text: line.text,
        time: new Date().toISOString(),
      })),
      offlineModelConfig: { model: engineRef.current?.modelId ?? 'Llama-3.2-1B-Instruct-q4f16_1-MLC', temperature: 0.7 },
    });

    if (result) {
      setGistNotice(result.url);
      pushLog({ kind: 'output', text: `Telemetry transmitted via Gist: ${result.url}` });
    } else if (gist.error) {
      setGistNotice(null);
      pushLog({ kind: 'error', text: gist.error });
    }
  }, [gist, log, pushLog, resonanceHz]);

  const handleSubmit = useCallback(async () => {
    const prompt = command.trim();
    if (prompt.length === 0 || thinking) return;
    setCommand('');
    setThinking(true);
    pushLog({ kind: 'prompt', text: prompt });

    try {
      if (!engineRef.current) {
        engineRef.current = new SovereignAIEngine();
      }
      const engine = engineRef.current;

      const full = await engine.generateStream(prompt, SYSTEM_PROMPT, (accumulated) => {
        const structured = parseAIOutputMarkup(accumulated);
        setLog((previous) => {
          const next = [...previous];
          const lastIndex = next.length - 1;
          if (next[lastIndex]?.kind === 'output' && next[lastIndex]?.id?.startsWith('stream-')) {
            next[lastIndex] = { ...next[lastIndex], text: structured.speech_text };
          } else {
            logIdRef.current += 1;
            next.push({ id: `stream-${logIdRef.current}`, kind: 'output', text: structured.speech_text });
          }
          return next;
        });
      });

      const structured = parseAIOutputMarkup(full);
      if (structured.cues.length > 0) {
        pushLog({
          kind: 'output',
          text: `[SEMANTIC] ${structured.cues.length} gesture/emotion cues · ${structured.visemes.length} visemes`,
        });
      }
      setOrchestratorTone('online');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local inference failed.';
      pushLog({
        kind: 'error',
        text: `[OFFLINE-AI] ${message} Drop quantized weights into /public/models to enable local WebGPU inference.`,
      });
      setOrchestratorTone('degraded');
    } finally {
      setThinking(false);
    }
  }, [command, pushLog, thinking]);

  const handleMic = useCallback(async () => {
    if (audio.source === 'microphone') {
      pushLog({ kind: 'output', text: 'Microphone already streaming into the reactor.' });
      return;
    }
    await audio.startMicrophone();
    pushLog({
      kind: audio.source === 'oscillator' ? 'warning' : 'output',
      text:
        audio.source === 'oscillator'
          ? 'Microphone denied — synthetic 1207 Hz carrier engaged.'
          : 'Microphone capture active. Speak to your twin.',
    });
  }, [audio, pushLog]);

  /* -------------------------------------------------------------- render -- */

  const telemetryMetrics = useMemo(
    () => [
      { label: 'DIM', value: `${RESONANCE_HZ} / ${RESONANCE_HZ}` },
      { label: 'SIGNAL', value: audio.running ? 'LOCKED' : 'SYNTH' },
      { label: 'MESH', value: navigator.onLine ? 'ONLINE' : 'LOCAL' },
    ],
    [audio.running],
  );

  const orchestratorStatusLabel =
    orchestratorTone === 'online'
      ? 'ACTIVE'
      : orchestratorTone === 'testing'
        ? 'TESTING'
        : orchestratorTone === 'degraded'
          ? 'DEGRADED'
          : 'COLLAPSED';

  if (route === 'convert') {
    return (
      <div className="hud-app-shell portal-shell">
        <MatrixRainCanvas resonance={audio.resonance} opacity={0.35} />
        <Convert onNavigateHome={() => setRoute('portal')} />
      </div>
    );
  }

  return (
    <div className="hud-app-shell portal-shell">
      <MatrixRainCanvas resonance={audio.resonance} opacity={0.5} />

      <ScanlineFilter opacity={0.22} sweepSeconds={6} className="portal-shell__scanlines">
        <div className="portal-shell__inner">
          {/* -------------------------------------------------- telemetry -- */}
          <header className="portal-header">
            <div className="portal-header__title">
              <span className="portal-header__mark" aria-hidden="true" />
              <div>
                <h1>RICK C-137 PORTAL INTERFACE</h1>
                <p>// TWIN PORTAL · {clock.toLocaleTimeString()}</p>
              </div>
            </div>
            <div className="portal-header__telemetry">
              <TelemetryCard
                title="Dimension Coordinate"
                value={`${RESONANCE_HZ} / ${RESONANCE_HZ}`}
                metrics={telemetryMetrics}
                statusLabel={orchestratorStatusLabel}
                tone={orchestratorTone === 'degraded' ? 'alert' : 'cyan'}
              />
              <TelemetryCard
                title="Stability"
                value={STABILITY_LABEL}
                unit=""
                metrics={[
                  { label: 'FLUX', value: (0.0612 - audio.resonance * 0.04).toFixed(4) },
                  { label: 'RESONANCE', value: `${resonanceHz}`, unit: 'Hz' },
                ]}
                alert={orchestratorTone === 'degraded'}
              />
            </div>
          </header>

          {/* ------------------------------------------- orchestrator card -- */}
          <section className={`portal-orchestrator${collapsed ? ' portal-orchestrator--collapsed' : ''}`}>
            <header className="portal-orchestrator__header">
              <div className="portal-orchestrator__status">
                <span className="hud-dot" />
                <strong>ORCHESTRATOR {orchestratorStatusLabel}</strong>
              </div>
              <div className="portal-orchestrator__reticle">
                <Reticle size={56} speed={thinking ? 2.4 : 1} />
              </div>
            </header>

            {!collapsed && (
              <>
                <TerminalPrompt lines={log} height={200} caret={thinking} />

                <div className="portal-orchestrator__waveform">
                  <WaveformBar
                    data={audio.source === 'microphone' ? audio.waveform : audio.frequency}
                    resonance={audio.resonance}
                    height={44}
                  />
                  <span className="portal-orchestrator__resonance">
                    {(audio.resonance * 100).toFixed(0)}% RES
                  </span>
                </div>

                <div className="portal-actions">
                  <button type="button" className="portal-btn portal-btn--primary" onClick={handleFire}>
                    FIRE
                  </button>
                  <button type="button" className="portal-btn" onClick={handlePin}>
                    PIN
                  </button>
                  <button type="button" className="portal-btn" onClick={handleRetest}>
                    RETEST
                  </button>
                  <button type="button" className="portal-btn" onClick={handleRecalibrate}>
                    RECALIBRATE
                  </button>
                  <button type="button" className="portal-btn" onClick={handleCollapse}>
                    COLLAPSE
                  </button>
                  <button
                    type="button"
                    className="portal-btn portal-btn--gist"
                    onClick={handleGist}
                    disabled={gist.transmitting}
                  >
                    {gist.transmitting ? 'TRANSMITTING…' : 'GIST'}
                  </button>
                </div>

                {pinned && (
                  <div className="portal-pinned">
                    <span>PINNED</span>
                    <p>{pinned.text}</p>
                  </div>
                )}

                {gistNotice && (
                  <a className="portal-gist-link" href={gistNotice} target="_blank" rel="noreferrer">
                    Telemetry gist → {gistNotice}
                  </a>
                )}

                {audio.error && <p className="portal-warning">{audio.error}</p>}
              </>
            )}

            {collapsed && (
              <button type="button" className="portal-btn portal-btn--wide" onClick={handleCollapse}>
                EXPAND ORCHESTRATOR
              </button>
            )}
          </section>

          {/* ------------------------------------------------- video stage -- */}
          <section className="portal-stage">
            <VideoStage onCue={handleCue} />
          </section>

          {/* --------------------------------------------- command capsule -- */}
          <footer className="portal-capsule">
            <button
              type="button"
              className={`portal-capsule__mic${audio.source === 'microphone' ? ' portal-capsule__mic--live' : ''}`}
              onClick={handleMic}
              disabled={audio.connecting}
              aria-label="Toggle microphone"
              title="Toggle microphone"
            >
              {audio.connecting ? '…' : 'MIC'}
            </button>

            <input
              className="portal-capsule__input"
              value={command}
              placeholder="Type or speak to your twin…"
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              aria-label="Command input"
            />

            <button
              type="button"
              className="portal-capsule__send"
              onClick={() => void handleSubmit()}
              disabled={thinking || command.trim().length === 0}
            >
              {thinking ? 'THINK' : 'SEND'}
            </button>

            <button type="button" className="portal-capsule__aux" onClick={() => setRoute('convert')}>
              /convert
            </button>
          </footer>

          <InstallPwaBanner />
        </div>
      </ScanlineFilter>
    </div>
  );
};

export default App;
