import { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render: (element: HTMLElement, options: {
    sitekey: string;
    action: string;
    theme: 'light';
    size: 'flexible';
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<void> | undefined;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => { scriptPromise = undefined; script.remove(); reject(new Error('Verification could not load.')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function Turnstile({ siteKey, action, onToken }: {
  siteKey: string;
  action: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let widget: string | undefined;
    onToken(null);
    void loadScript().then(() => {
      if (cancelled || !container.current || !window.turnstile) return;
      widget = window.turnstile.render(container.current, {
        sitekey: siteKey, action, theme: 'light', size: 'flexible',
        callback: (token) => { setError(false); onToken(token); },
        'expired-callback': () => onToken(null),
        'error-callback': () => { setError(true); onToken(null); },
      });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      if (widget !== undefined && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey, action, onToken]);
  return <div className="verification-widget">
    <div ref={container} />
    {error && <p className="error-text" role="alert">Security verification could not load. Check your connection or use a fictional example.</p>}
  </div>;
}
