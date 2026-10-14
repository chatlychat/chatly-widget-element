/**
 * The wrapper's half of lazy loading.
 *
 * Three things, each of which has a specific way of going wrong silently:
 *
 *   - `lazy` must reach the shim as a PROPERTY, before the loader script is
 *     appended. The loader reads it as its own script evaluates, so a write
 *     that lands afterwards is a write that never happened — and the symptom
 *     is lazy mode simply not working, with nothing in the console;
 *   - `lazy` must NOT reach the widget's `init`. The widget ignores unknown
 *     options, so a leak there looks exactly like a setting that works;
 *   - `prefetchWidget()` must go through the global rather than `controls`,
 *     because `load` is the loader's verb and `dispatch`'s "no widget is
 *     mounted" warning is the wrong message for it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __testing, startWidget } from './embed.js';
import { prefetchWidget, warnLateBootOption } from './lazy.js';

import type { ChatlyEmbedOptions } from './types.js';

let calls: unknown[][] = [];

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & { q?: unknown[]; publicId?: string; lazy?: unknown };
}

const w = globalThis.window as unknown as ShimWindow;

function installShim(): void {
  calls = [];
  w.Chatly = Object.assign((...args: unknown[]) => {
    calls.push(args);
  }, {});
}

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c[0] === method).map((c) => c.slice(1));
}

const BASE: ChatlyEmbedOptions = { publicId: 'acme-web' };

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
  delete w.Chatly;
  __testing.reset();
  installShim();
});

afterEach(() => {
  __testing.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('handing lazy to the loader', () => {
  it('writes it onto the shim, where loader.js reads it', () => {
    startWidget({}, { ...BASE, lazy: true });
    expect(w.Chatly?.lazy).toBe(true);
  });

  it('writes it before the loader script is appended', () => {
    // The ordering IS the feature. `loader.js` decides whether to fetch the
    // bundle as its own script evaluates, so a `lazy` written after the tag
    // is in the document is a coin flip at best.
    delete w.Chatly;
    let lazyWhenAppended: unknown = 'never appended';
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      lazyWhenAppended = w.Chatly?.lazy;
      return original(node);
    }) as typeof document.head.appendChild);

    startWidget({}, { ...BASE, lazy: 'manual' });
    expect(lazyWhenAppended).toBe('manual');
  });

  it('queues the init before the loader script, so the placeholder has a theme', () => {
    // The loader paints its stand-in launcher from the queued `init`'s theme.
    // It can only do that if the init is already in the queue when the loader
    // evaluates.
    delete w.Chatly;
    let queuedWhenAppended = 0;
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
      queuedWhenAppended = w.Chatly?.q?.length ?? 0;
      return original(node);
    }) as typeof document.head.appendChild);

    startWidget({}, { ...BASE, lazy: true, theme: { primaryColor: '#abcdef' } });
    expect(queuedWhenAppended).toBeGreaterThan(0);
  });

  it('leaves the shim alone when lazy is unset', () => {
    // Every existing embed: no property, so `normalizeLazy(undefined)` is off
    // and the loader fetches eagerly exactly as before.
    startWidget({}, BASE);
    expect('lazy' in (w.Chatly ?? {})).toBe(false);
  });

  it('does not pass lazy through to the widget init', () => {
    startWidget({}, { ...BASE, lazy: 'interaction', theme: { primaryColor: '#111111' } });
    expect(argsFor('init')[0]?.[0]).toEqual({
      publicId: 'acme-web',
      theme: { primaryColor: '#111111' },
    });
  });

  it('does not re-init when only lazy changes', () => {
    // Re-initialising would destroy and remount the widget, closing the
    // visitor's open panel, to apply a setting that cannot be applied.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = startWidget({}, { ...BASE, lazy: true });
    handle.update({ ...BASE, lazy: 'manual' });
    expect(argsFor('init')).toHaveLength(1);
  });

  it('warns when lazy changes after the loader ran, instead of ignoring it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = startWidget({}, { ...BASE, lazy: true });
    handle.update({ ...BASE, lazy: false });
    const text = warn.mock.calls.flat().join(' ');
    expect(text).toContain('lazy');
    expect(text).toContain('needs a page reload');
  });

  it('warns once per change, not once per render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = startWidget({}, { ...BASE, lazy: true });
    handle.update({ ...BASE, lazy: false });
    handle.update({ ...BASE, lazy: false });
    handle.update({ ...BASE, lazy: false });
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('lazy'))).toHaveLength(1);
  });
});

describe('prefetchWidget', () => {
  it('asks the loader to start the download', () => {
    startWidget({}, { ...BASE, lazy: true });
    calls = [];
    prefetchWidget();
    expect(calls).toEqual([['load']]);
  });

  it('says nothing once the bundle has arrived', () => {
    /*
     * The bundle's `dispatch` warns `ignored a call to unknown method "load"`
     * for any name not on its API object, and `load` is not on it — it is the
     * loader's verb. So a `<ChatlyLauncher>` on a page whose widget had
     * finished loading printed that warning on EVERY hover: a prefetch that
     * is a no-op by then, reported to the embedder as a mistake.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    startWidget({}, { ...BASE, lazy: true });
    // `init` present is how `embed.ts` itself asks "has the bundle landed".
    (w.Chatly as unknown as { init: () => void }).init = () => undefined;
    calls = [];
    prefetchWidget();
    expect(calls).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing when no shim exists', () => {
    // A hover on a host page where nothing has been mounted is not a mistake
    // worth a console line — and `startWidget` has already warned if a mount
    // was attempted without a publicId.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete w.Chatly;
    expect(() => prefetchWidget()).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('warnLateBootOption', () => {
  it('names the option and both values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnLateBootOption('loaderUrl', 'https://a.test/loader.js', 'https://b.test/loader.js');
    const text = String(warn.mock.calls[0]?.[0] ?? '');
    expect(text).toContain('loaderUrl');
    expect(text).toContain('a.test');
    expect(text).toContain('b.test');
  });
});
