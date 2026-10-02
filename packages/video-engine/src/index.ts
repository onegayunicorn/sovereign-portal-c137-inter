/**
 * @portal/video-engine
 * Sovereign Portal C-137 — frame-accurate interactive video timeline.
 */

export { VideoSyncEngine } from './VideoSyncEngine';
export type {
  TimelineCue,
  TimelineCuePayload,
  TimelineCueType,
  VideoSyncListener,
} from './VideoSyncEngine';

/** Static path of the shipped WebVTT cue manifest. */
export const TIMELINE_VTT_PATH = '/timeline.vtt';

/**
 * Parses a WebVTT cue manifest produced by `timeline.vtt` into TimelineCue
 * objects. Each cue body's first line is a JSON payload, the second is the label.
 * Cues with invalid JSON are skipped rather than throwing.
 */
export function parseTimelineVtt(vtt: string): Array<{
  id: string;
  start: number;
  end: number;
  type: 'hotspot' | 'branch_choice' | 'telemetry_ping' | 'cv_track';
  coordinates?: { x: number; y: number; width?: number; height?: number };
  payload: Record<string, unknown>;
  label: string;
}> {
  const toSeconds = (stamp: string): number => {
    const [hh, mm, rest] = stamp.split(':');
    const [ss, ms] = rest.split('.');
    return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(`0.${ms ?? '0'}`);
  };

  const cues: Array<{
    id: string;
    start: number;
    end: number;
    type: 'hotspot' | 'branch_choice' | 'telemetry_ping' | 'cv_track';
    coordinates?: { x: number; y: number; width?: number; height?: number };
    payload: Record<string, unknown>;
    label: string;
  }> = [];

  const blocks = vtt
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !block.startsWith('WEBVTT') && !block.startsWith('NOTE'));

  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;

    const [startStamp, endStamp] = lines[timingIndex].split('-->').map((part) => part.trim());
    const body = lines.slice(timingIndex + 1).join('\n').trim();
    if (!body) continue;

    const jsonLine = body.split('\n')[0];
    const label = body.split('\n').slice(1).join(' ').trim() || jsonLine;

    try {
      const parsed = JSON.parse(jsonLine) as {
        id?: string;
        type?: string;
        coordinates?: { x: number; y: number; width?: number; height?: number };
        payload?: Record<string, unknown>;
      };
      const type = (parsed.type ?? 'hotspot') as 'hotspot' | 'branch_choice' | 'telemetry_ping' | 'cv_track';
      cues.push({
        id: parsed.id ?? `cue-${cues.length + 1}`,
        start: toSeconds(startStamp),
        end: toSeconds(endStamp),
        type,
        coordinates: parsed.coordinates,
        payload: { ...(parsed.payload ?? {}), label: (parsed.payload?.label as string) ?? label },
        label,
      });
    } catch {
      // Malformed payload line — skip this cue, keep the rest of the manifest.
    }
  }

  return cues;
}
