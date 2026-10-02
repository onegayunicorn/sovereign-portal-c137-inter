/**
 * ai-semantic-mapper
 * Translates streaming LLM output with embedded semantic tags into synchronized
 * lip-sync visemes and skeletal gestures for the portal avatar / HUD.
 *
 * Supported tags (self-closing):
 *   <gesture name="point_ui" targetX="75" targetY="40" time="120" />
 *   <emotion name="smug" intensity="0.8" time="240" />
 *   <look_at targetX="50" targetY="20" time="300" />
 *   <viseme target="viseme_aa" time="360" weight="0.9" />
 */

export type SemanticCueType = 'gesture' | 'emotion' | 'look_at' | 'viseme';

export interface SemanticCue {
  timestamp_ms: number;
  type: SemanticCueType;
  value: string;
  intensity?: number;
  uiTargetPercent?: { x: number; y: number };
}

export interface GeneratedViseme {
  time: number;
  target: string;
  weight: number;
}

export interface StructuredAIResponse {
  speech_text: string;
  audio_url?: string;
  visemes: GeneratedViseme[];
  cues: SemanticCue[];
}

const TAG_REGEX = /<([a-z_]+)\s+([^>]+?)\/?>/gi;
const ATTR_REGEX = /([a-zA-Z0-9_]+)="([^"]*)"/g;

/** Viseme duration table (seconds) keyed by the source grapheme class. */
const VISEME_DURATIONS: Record<string, number> = {
  viseme_aa: 0.12,
  viseme_O: 0.12,
  viseme_PP: 0.08,
  viseme_FF: 0.08,
  viseme_TH: 0.09,
  viseme_sil: 0.06,
};

function safeParseInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeParseFloat(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Maps a single lower-case grapheme to a viseme target + duration. */
function graphemeToViseme(char: string): { target: string; duration: number } {
  if ('aei'.includes(char)) return { target: 'viseme_aa', duration: VISEME_DURATIONS.viseme_aa };
  if ('ou'.includes(char)) return { target: 'viseme_O', duration: VISEME_DURATIONS.viseme_O };
  if ('bmp'.includes(char)) return { target: 'viseme_PP', duration: VISEME_DURATIONS.viseme_PP };
  if ('fv'.includes(char)) return { target: 'viseme_FF', duration: VISEME_DURATIONS.viseme_FF };
  if ('th'.includes(char)) return { target: 'viseme_TH', duration: VISEME_DURATIONS.viseme_TH };
  return { target: 'viseme_sil', duration: VISEME_DURATIONS.viseme_sil };
}

/**
 * Generates a viseme timeline from plain speech text.
 * Each grapheme emits an onset viseme plus a short silence release, which keeps
 * the mouth from freezing between syllables.
 */
export function generateVisemesFromText(text: string): GeneratedViseme[] {
  const visemes: GeneratedViseme[] = [];
  const chars = text.toLowerCase().split('');
  let timeCursor = 0;

  for (const char of chars) {
    if (char === ' ') {
      timeCursor += 0.04;
      continue;
    }

    const { target, duration } = graphemeToViseme(char);
    visemes.push({ time: Number(timeCursor.toFixed(3)), target, weight: 0.9 });
    visemes.push({
      time: Number((timeCursor + duration).toFixed(3)),
      target: 'viseme_sil',
      weight: 0.1,
    });
    timeCursor += duration;
  }

  return visemes;
}

/** Alias kept for blueprint naming parity. */
export const generateVisemes = generateVisemesFromText;

/**
 * Parses raw LLM markup into structured speech + cues, stripping every tag from
 * the spoken text.
 */
export function parseAIOutputMarkup(rawText: string): StructuredAIResponse {
  const cues: SemanticCue[] = [];
  const matchable = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);

  let match: RegExpExecArray | null;
  while ((match = matchable.exec(rawText)) !== null) {
    const tagName = match[1].toLowerCase();
    const attrString = match[2];

    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;
    const attrRegex = new RegExp(ATTR_REGEX.source, ATTR_REGEX.flags);
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }

    const timestamp_ms = safeParseInt(attrs.time, 0);
    const hasTarget = attrs.targetX !== undefined && attrs.targetY !== undefined;
    const uiTargetPercent = hasTarget
      ? { x: safeParseFloat(attrs.targetX, 50), y: safeParseFloat(attrs.targetY, 50) }
      : undefined;

    switch (tagName) {
      case 'gesture':
        cues.push({
          timestamp_ms,
          type: 'gesture',
          value: attrs.name ?? 'point_right',
          uiTargetPercent,
        });
        break;
      case 'emotion':
        cues.push({
          timestamp_ms,
          type: 'emotion',
          value: attrs.name ?? 'neutral',
          intensity: safeParseFloat(attrs.intensity, 1.0),
        });
        break;
      case 'look_at':
        cues.push({
          timestamp_ms,
          type: 'look_at',
          value: attrs.name ?? 'ui_target',
          uiTargetPercent: uiTargetPercent ?? { x: 50, y: 50 },
        });
        break;
      case 'viseme':
        cues.push({
          timestamp_ms,
          type: 'viseme',
          value: attrs.target ?? 'viseme_sil',
          intensity: safeParseFloat(attrs.weight, 0.9),
        });
        break;
      default:
        break;
    }
  }

  const cleanSpeech = rawText.replace(new RegExp(TAG_REGEX.source, TAG_REGEX.flags), '').trim();
  const syntheticVisemes = generateVisemesFromText(cleanSpeech);

  // Explicit <viseme> tags override the synthetic timeline when present.
  const explicitVisemes = cues.filter((cue) => cue.type === 'viseme');
  const visemes: GeneratedViseme[] =
    explicitVisemes.length > 0
      ? explicitVisemes.map((cue) => ({
          time: cue.timestamp_ms / 1000,
          target: cue.value,
          weight: cue.intensity ?? 0.9,
        }))
      : syntheticVisemes;

  return {
    speech_text: cleanSpeech,
    visemes,
    cues,
  };
}

/**
 * Resolves the active viseme for a playback cursor.
 * Returns `null` when the timeline has no sample for that instant.
 */
export function resolveVisemeAt(
  visemes: GeneratedViseme[],
  timeSeconds: number,
): GeneratedViseme | null {
  if (visemes.length === 0) return null;
  let current: GeneratedViseme | null = null;
  for (const viseme of visemes) {
    if (viseme.time > timeSeconds) break;
    current = viseme;
  }
  return current;
}

/**
 * Convenience state reducer: strips markup incrementally while streaming and
 * returns the currently spoken text plus the cues discovered so far.
 */
export function reduceStreamingMarkup(buffer: string): StructuredAIResponse {
  return parseAIOutputMarkup(buffer);
}
