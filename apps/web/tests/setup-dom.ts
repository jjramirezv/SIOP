import { afterEach, beforeEach, vi } from 'vitest';

if (typeof window !== 'undefined') {
  beforeEach(() => {
    // jsdom no calcula layout. Proveer dimensiones al observer permite renderizar Recharts.
    vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback([{ target, contentRect: { width: 640, height: 300 } } as ResizeObserverEntry], this);
      }
      unobserve() {}
      disconnect() {}
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });
}
