import { useEffect, useState } from 'react';

// "Hide amounts" changed in Profile: Home sends the widget its numbers again
const listeners = new Set<(n: number) => void>();
let version = 0;

export function widgetSettingsChanged() {
  version += 1;
  listeners.forEach(l => l(version));
}

export function useWidgetSettingsVersion() {
  const [v, setV] = useState(version);
  useEffect(() => { listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}
