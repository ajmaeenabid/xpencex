// Tells the opening animation when the app behind it is ready (sign-in checked), so the animation can stay
// on screen until then instead of handing over to a loading spinner. See OpeningAnimation.tsx.

type Listener = () => void;

export function createReadySignal() {
  let ready = false;
  const listeners = new Set<Listener>();
  return {
    isReady: () => ready,
    markReady() {
      if (ready) return;
      ready = true;
      listeners.forEach(listener => listener());
      listeners.clear();
    },
    /** Calls `listener` once the app is ready (straight away if it already is). Returns a way to stop listening. */
    onReady(listener: Listener): () => void {
      if (ready) {
        listener();
        return () => {};
      }
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const appStartup = createReadySignal();
