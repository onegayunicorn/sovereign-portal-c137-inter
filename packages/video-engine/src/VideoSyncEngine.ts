/**
 * video-engine / VideoSyncEngine.ts
 * Sovereign Portal C-137 — frame-accurate interactive video timeline.
 *
 * Replaces inaccurate 250ms `timeupdate` polling with hardware v-synced
 * `requestVideoFrameCallback` frame triggers, falling back to rAF on browsers
 * that have not shipped the API (Safari < 15.4).
 *
 * Layer model (matches the deconstructed C-137 stage):
 *   Layer 1 — native HTML5 <video>
 *   Layer 2 — WebGL portal vortex canvas (owned by @portal/matrix-engine)
 *   Layer 3 — this engine's interactive DOM overlay
 */

export type TimelineCueType = 'hotspot' | 'branch_choice' | 'telemetry_ping' | 'cv_track';

export interface TimelineCuePayload {
  label?: string;
  dimensionCode?: string;
  seekTarget?: number;
  /** Confidence for cv_track cues (0..1). */
  confidence?: number;
  /** Tracking box for cv_track cues, percentages 0-100. */
  box?: { x: number; y: number; width: number; height: number };
  /** Arbitrary metadata forwarded to telemetry subscribers. */
  meta?: Record<string, unknown>;
  action?: (video: HTMLVideoElement) => void;
}

export interface TimelineCue {
  id: string;
  start: number; // Seconds
  end: number; // Seconds
  type: TimelineCueType;
  /** Percentage (0-100) anchor for the overlay element. */
  coordinates?: { x: number; y: number; width?: number; height?: number };
  payload: TimelineCuePayload;
}

export type VideoSyncListener = (cue: TimelineCue, mediaTime: number) => void;

export class VideoSyncEngine {
  private video: HTMLVideoElement;
  private overlay: HTMLElement;
  private cues: TimelineCue[] = [];
  private activeCues = new Set<string>();

  private frameHandle: number | null = null;
  private running = false;
  private destroyed = false;

  private mediaTime = 0;
  private readonly subscribers = new Set<VideoSyncListener>();
  /** Cues already fired as one-shot telemetry pings. */
  private readonly firedPings = new Set<string>();

  constructor(video: HTMLVideoElement, overlay: HTMLElement, cues: TimelineCue[]) {
    this.video = video;
    this.overlay = overlay;
    this.cues = cues;
    this.initLoop();
  }

  // -------------------------------------------------------------- lifecycle

  private initLoop(): void {
    this.running = true;

    const handleFrame = (_now: DOMHighResTimeStamp, metadata?: VideoFrameCallbackMetadata) => {
      if (!this.running || this.destroyed) return;

      const currentTime = metadata ? metadata.mediaTime : this.video.currentTime;
      this.mediaTime = currentTime;
      this.evaluateTimeline(currentTime);

      if ('requestVideoFrameCallback' in this.video) {
        this.frameHandle = (this.video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: VideoFrameRequestCallback) => number;
        }).requestVideoFrameCallback(handleFrame as VideoFrameRequestCallback);
      } else {
        this.frameHandle = requestAnimationFrame(() => handleFrame(performance.now()));
      }
    };

    if ('requestVideoFrameCallback' in this.video) {
      this.frameHandle = (this.video as HTMLVideoElement & {
        requestVideoFrameCallback: (cb: VideoFrameRequestCallback) => number;
      }).requestVideoFrameCallback(handleFrame as VideoFrameRequestCallback);
    } else {
      this.frameHandle = requestAnimationFrame(() => handleFrame(performance.now()));
    }
  }

  private evaluateTimeline(time: number): void {
    const matching = this.cues.filter((c) => time >= c.start && time <= c.end);
    const matchingIds = new Set(matching.map((m) => m.id));

    // Clear stale overlays
    this.activeCues.forEach((id) => {
      if (!matchingIds.has(id)) {
        document.getElementById(`cue-${id}`)?.remove();
        this.activeCues.delete(id);
      }
    });

    // Render active hotspots, branching choices, cv tracks and fire telemetry pings
    matching.forEach((cue) => {
      if (!this.activeCues.has(cue.id)) {
        this.renderCueElement(cue);
        this.activeCues.add(cue.id);
      }

      if (cue.type === 'telemetry_ping' && !this.firedPings.has(cue.id)) {
        this.firedPings.add(cue.id);
        this.subscribers.forEach((listener) => listener(cue, time));
      }
    });
  }

  private renderCueElement(cue: TimelineCue): void {
    const el = document.createElement('div');
    el.id = `cue-${cue.id}`;
    el.style.position = 'absolute';
    el.style.left = `${cue.coordinates?.x ?? 50}%`;
    el.style.top = `${cue.coordinates?.y ?? 50}%`;
    el.style.transform = 'translate(-50%, -50%)';
    el.style.pointerEvents = 'auto';

    if (cue.type === 'hotspot') {
      el.innerHTML = `
        <button class="hud-hotspot-btn" style="
          background: rgba(0, 255, 136, 0.2);
          border: 1px solid #00ff88;
          color: #00ff88;
          font-family: monospace;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          backdrop-filter: blur(4px);
          box-shadow: 0 0 10px rgba(0, 255, 136, 0.4);
        ">
          &#9889; ${cue.payload.label ?? 'SCAN PORTAL NODE'}
        </button>
      `;
      el.onclick = () => cue.payload.action?.(this.video);
    } else if (cue.type === 'branch_choice') {
      const dimensionCode = cue.payload.dimensionCode ?? 'C-137';
      el.innerHTML = `
        <div class="branch-modal" style="
          background: rgba(1, 10, 4, 0.9);
          border: 1px solid #00e5ff;
          padding: 12px;
          border-radius: 6px;
          font-family: monospace;
        ">
          <p style="color: #00e5ff; font-size: 11px; margin-bottom: 8px;">DIMENSIONAL BRANCH POINT</p>
          <button class="branch-btn" id="choice-${cue.id}-jump">Jump to ${dimensionCode}</button>
          <button class="branch-btn" id="choice-${cue.id}-abort">Abort Jump</button>
        </div>
      `;
      el.querySelector(`#choice-${cue.id}-jump`)?.addEventListener('click', () => {
        this.seek(cue.payload.seekTarget ?? 0);
      });
      el.querySelector(`#choice-${cue.id}-abort`)?.addEventListener('click', () => {
        this.removeCue(cue.id);
      });
    } else if (cue.type === 'cv_track') {
      const box = cue.payload.box ?? {
        x: cue.coordinates?.x ?? 50,
        y: cue.coordinates?.y ?? 50,
        width: cue.coordinates?.width ?? 10,
        height: cue.coordinates?.height ?? 10,
      };
      const confidence = cue.payload.confidence ?? 0;
      el.style.transform = 'none';
      el.style.left = `${box.x}%`;
      el.style.top = `${box.y}%`;
      el.innerHTML = `
        <div class="cv-track-box" style="
          position: absolute;
          width: ${box.width}vw;
          min-width: 48px;
          border: 1px dashed #d4ff00;
          box-shadow: 0 0 10px rgba(212, 255, 0, 0.35);
          color: #d4ff00;
          font-family: monospace;
          font-size: 10px;
          padding: 2px 4px;
        ">
          <span style="position: absolute; top: -14px; left: 0; white-space: nowrap;">
            ${cue.payload.label ?? 'TRACK'} ${(confidence * 100).toFixed(0)}%
          </span>
          <span style="display: block; height: ${box.height}vh; min-height: 36px;"></span>
        </div>
      `;
    } else {
      // telemetry_ping is a non-visual cue: fire a beacon flash instead of a control.
      el.style.pointerEvents = 'none';
      el.innerHTML = `
        <div style="
          width: 14px; height: 14px; border-radius: 50%;
          background: radial-gradient(circle, rgba(212,255,0,0.95) 0%, rgba(212,255,0,0) 70%);
          animation: hud-pulse 0.9s ease-out infinite;
        "></div>
      `;
      // Auto-retire the beacon so it does not accumulate on the DOM.
      window.setTimeout(() => this.removeCue(cue.id), Math.max(250, (cue.end - cue.start) * 1000));
    }

    this.overlay.appendChild(el);
  }

  // ------------------------------------------------------------ public API

  /** Registers a listener for one-shot `telemetry_ping` cues. */
  onCue(listener: VideoSyncListener): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  /** Frame-accurate seek + resume (used by branch choices). */
  seek(targetTime: number): void {
    try {
      this.video.currentTime = targetTime;
    } catch {
      // Some browsers throw if metadata has not loaded yet — retry once ready.
      this.video.addEventListener('loadedmetadata', () => {
        this.video.currentTime = targetTime;
      }, { once: true });
      return;
    }
    void this.video.play().catch(() => undefined);
    this.resetTransientState();
  }

  /** Replaces the cue manifest at runtime (e.g. after a branch jump). */
  setCues(cues: TimelineCue[]): void {
    this.cues = cues;
    this.resetTransientState();
  }

  /** Adds a single cue without discarding the rest of the manifest. */
  addCue(cue: TimelineCue): void {
    this.cues = [...this.cues.filter((existing) => existing.id !== cue.id), cue];
  }

  /** Removes a rendered cue element and its active flag. */
  removeCue(cueId: string): void {
    document.getElementById(`cue-${cueId}`)?.remove();
    this.activeCues.delete(cueId);
    this.firedPings.delete(cueId);
  }

  /** Current hardware-synced media time in seconds. */
  getCurrentTime(): number {
    return this.mediaTime;
  }

  /** Cues matching the supplied time (defaults to the current media time). */
  getActiveCues(time: number = this.mediaTime): TimelineCue[] {
    return this.cues.filter((cue) => time >= cue.start && time <= cue.end);
  }

  private resetTransientState(): void {
    this.activeCues.forEach((id) => document.getElementById(`cue-${id}`)?.remove());
    this.activeCues.clear();
    this.firedPings.clear();
  }

  /** Stops the frame loop and removes every overlay element. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;

    if (this.frameHandle !== null) {
      const video = this.video as HTMLVideoElement & {
        cancelVideoFrameCallback?: (handle: number) => void;
      };
      if (typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(this.frameHandle);
      } else {
        cancelAnimationFrame(this.frameHandle);
      }
      this.frameHandle = null;
    }

    this.resetTransientState();
    this.subscribers.clear();
  }
}

export default VideoSyncEngine;
