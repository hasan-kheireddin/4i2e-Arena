import { useEffect, useState } from 'react';

export type Dir = 'ltr' | 'rtl';

/**
 * Observes the `dir` attribute on <html> and re-renders when it changes.
 * Returns `{ dir, isRTL }`.
 */
export function useDir(): { dir: Dir; isRTL: boolean } {
  const [dir, setDir] = useState<Dir>(
    () => (document.documentElement.getAttribute('dir') as Dir) ?? 'ltr'
  );

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDir((document.documentElement.getAttribute('dir') as Dir) ?? 'ltr');
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dir'],
    });
    return () => obs.disconnect();
  }, []);

  return { dir, isRTL: dir === 'rtl' };
}
