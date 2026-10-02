import React, { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export interface InstallPwaBannerProps {
  /** Delay before the banner slides in, in ms. Default 4000. */
  delayMs?: number;
  /** localStorage key used to remember dismissal. */
  storageKey?: string;
}

const DISMISS_KEY = 'portal-c137.install-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
    navigatorWithStandalone.standalone === true
  );
}

/**
 * InstallPwaBanner — captures `beforeinstallprompt` and offers a one-tap
 * sovereign install. Automatically hides when already installed, and remembers
 * dismissal per device.
 */
export const InstallPwaBanner: React.FC<InstallPwaBannerProps> = ({
  delayMs = 4000,
  storageKey = DISMISS_KEY,
}) => {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(storageKey) === '1';
    } catch {
      dismissed = false;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const timer = window.setTimeout(() => {
      setVisible(!dismissed && !isStandalone());
    }, Math.max(0, delayMs));

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(timer);
    };
  }, [delayMs, storageKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Storage unavailable — the banner simply returns next session.
    }
  }, [storageKey]);

  const install = useCallback(async () => {
    if (!promptEvent) {
      dismiss();
      return;
    }
    setInstalling(true);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setVisible(false);
      } else {
        dismiss();
      }
    } catch {
      dismiss();
    } finally {
      setInstalling(false);
      setPromptEvent(null);
    }
  }, [dismiss, promptEvent]);

  if (installed || !visible) return null;

  return (
    <aside
      className="portal-install-banner"
      role="dialog"
      aria-label="Install Sovereign Portal C-137"
    >
      <div className="portal-install-banner__text">
        <strong>Install Portal C-137</strong>
        <span>Run the twin portal offline — no store, no telemetry.</span>
      </div>
      <div className="portal-install-banner__actions">
        <button type="button" className="portal-btn portal-btn--primary" onClick={install} disabled={installing}>
          {installing ? 'Installing…' : 'Install'}
        </button>
        <button type="button" className="portal-btn" onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
};

export default InstallPwaBanner;
