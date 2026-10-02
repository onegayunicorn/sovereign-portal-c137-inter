import React, { useEffect, useRef } from 'react';

export type TerminalLineKind = 'output' | 'prompt' | 'warning' | 'error';

export interface TerminalLine {
  id?: string;
  kind?: TerminalLineKind;
  text: string;
}

export interface TerminalPromptProps {
  /** Lines rendered top-to-bottom. */
  lines: TerminalLine[];
  /** Shows a blinking caret on the last line. Default true. */
  caret?: boolean;
  /** Auto-scroll to the newest line. Default true. */
  autoScroll?: boolean;
  /** Max height in pixels. Default 220. */
  height?: number;
  /** Extra class names merged onto the root. */
  className?: string;
  /** Accessible label. Default "Portal terminal output". */
  label?: string;
}

const KIND_CLASS: Record<TerminalLineKind, string> = {
  output: '',
  prompt: 'hud-terminal__prompt',
  warning: 'hud-terminal__warning',
  error: 'hud-terminal__error',
};

/**
 * Monospace terminal readout for orchestrator output, e.g.
 * "Portal test complete. Structure stable. You're clear to proceed."
 */
export const TerminalPrompt: React.FC<TerminalPromptProps> = ({
  lines,
  caret = true,
  autoScroll = true,
  height = 220,
  className,
  label = 'Portal terminal output',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const node = containerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [autoScroll, lines]);

  return (
    <div
      ref={containerRef}
      className={['hud-root', 'hud-terminal', className].filter(Boolean).join(' ')}
      style={{ maxHeight: height }}
      role="log"
      aria-live="polite"
      aria-label={label}
    >
      {lines.map((line, index) => (
        <span
          key={line.id ?? `${index}-${line.kind ?? 'output'}`}
          className={['hud-terminal__line', KIND_CLASS[line.kind ?? 'output']].filter(Boolean).join(' ')}
        >
          {line.kind === 'prompt' ? `> ${line.text}` : line.text}
        </span>
      ))}
      {caret && <span className="hud-terminal__caret" aria-hidden="true" />}
    </div>
  );
};

export default TerminalPrompt;
