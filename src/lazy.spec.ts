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
/** The shim's queue, read without the narrowing a `delete w.Chatly` imposes. */
function queued(): unknown[] {
  return (globalThis.window as unknown as ShimWindow).Chatly?.q ?? [];
}

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

  it('queues the init before any loader script, so the placeholder has a theme', () => {
    // The stand-in launcher is painted from the queued `init`'s theme, so the
    // init has to be in the queue before anything can draw it — which is now
    // before the first network request rather than before the loader's own
    // script evaluates.
    delete w.Chatly;
    startWidget({}, { ...BASE, lazy: true, theme: { primaryColor: '#abcdef' } });
    // Re-read through `queued()`, not `w.Chatly?.q`: the `delete` above narrows
    // the property to `never` for the rest of the block, so the direct read
    // does not typecheck even though it is correct at runtime.
    expect(queued().some((entry) => (entry as unknown[])[0] === 'init')).toBe(true);
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

/**
 * The leak this package shipped with, and the two tests that used to pin it.
 *
 * `boot` ended with an unconditional `injectLoader`, so EVERY mode fetched
 * `loader.js` from our CDN on page load — `'manual'` included, whose
 * documented promise is that nothing loads until the host calls `load()`. The
 * request carries the visitor's IP, user agent and referrer, so a page that
 * had set `lazy: 'manual'` and `storage: 'deny'` still told us a visitor was
 * there before they touched anything.
 *
 * Two tests in the block above asserted that script WAS appended at mount —
 * one checking `lazy` reached the shim before the tag, one checking the init
 * was queued before it. Both passed, and both encoded the leak as the
 * requirement. They are replaced rather than deleted: the ordering they cared
 * about is still real, it is just ordering against the first REQUEST now
 * instead of against the loader's own evaluation.
 *
 * `delete w.Chatly` in each case because the file's `installShim()` leaves a
 * pre-existing global behind, and `boot` deliberately injects nothing when the
 * host page brought its own snippet.
 */
describe('not contacting Chatly until the visitor reaches for the chat', () => {
  function loaderScripts(): Element[] {
    return [...document.head.querySelectorAll('script[data-chatly-loader]')];
  }

  function placeholder(): HTMLButtonElement | null {
    const host = document.querySelector('[data-chatly-placeholder]');
    return host?.shadowRoot?.querySelector('button') ?? null;
  }

  beforeEach(() => {
    delete w.Chatly;
    document.body.innerHTML = '';
  });

  it('fetches nothing at mount in manual mode', () => {
    startWidget({}, { ...BASE, lazy: 'manual' });
    expect(loaderScripts()).toHaveLength(0);
  });

  it('fetches when the host finally calls load()', () => {
    startWidget({}, { ...BASE, lazy: 'manual' });
    w.Chatly?.('load');
    expect(loaderScripts()).toHaveLength(1);
  });

  it('fetches on a host open() too, not only on load()', () => {
    // A header "Chat with us" button wired to `Chatly.open()` is the other
    // half of manual mode, and it may be the first thing clicked.
    startWidget({}, { ...BASE, lazy: 'manual' });
    w.Chatly?.('open');
    expect(loaderScripts()).toHaveLength(1);
  });

  it('is not woken by configuration calls', () => {
    // `setUser` and `setTheme` are bookkeeping the queue already preserves.
    // If either pulled the loader down, the mode would be privacy-preserving
    // in name only — and the identity loop issues `setUser` by itself.
    startWidget({}, { ...BASE, lazy: 'manual' });
    w.Chatly?.('setUser', { id: 'u1' });
    w.Chatly?.('setTheme', { primaryColor: '#000000' });
    expect(loaderScripts()).toHaveLength(0);
  });

  it('draws the stand-in launcher without fetching anything', () => {
    startWidget({}, { ...BASE, lazy: true, theme: { primaryColor: '#abcdef' } });
    expect(placeholder()).not.toBeNull();
    expect(loaderScripts()).toHaveLength(0);
  });

  it('fetches when the stand-in launcher is clicked', () => {
    startWidget({}, { ...BASE, lazy: true });
    placeholder()?.click();
    expect(loaderScripts()).toHaveLength(1);
  });

  it('fetches on the first page interaction under interaction mode', () => {
    startWidget({}, { ...BASE, lazy: 'interaction' });
    expect(loaderScripts()).toHaveLength(0);
    window.dispatchEvent(new Event('pointerdown'));
    expect(loaderScripts()).toHaveLength(1);
  });

  it('still fetches at mount when lazy is unset', () => {
    // Every existing embed. `off` means eager and changing that would move
    // the launcher's appearance on pages that never asked for it.
    startWidget({}, BASE);
    expect(loaderScripts()).toHaveLength(1);
  });

  it('clears lazy off the shim before injecting, so the loader does not re-arm', () => {
    /*
     * `loader.js` reads `lazy` as its own script evaluates. Left in place it
     * would arm a SECOND set of triggers: in launcher mode `drawPlaceholder`
     * refuses a second host, so nothing is drawn and the loader then waits
     * for a click the visitor has already given. The chat would never open.
     */
    startWidget({}, { ...BASE, lazy: true });
    placeholder()?.click();
    expect('lazy' in (w.Chatly ?? {})).toBe(false);
  });

  it('answers hasSession() before any request has been made', () => {
    // Normally installed by `loader.js`. Deferring the loader means the mode
    // most likely to ask — manual, deciding whether to call `load()` for a
    // returning chatter — would get `undefined is not a function`.
    startWidget({}, { ...BASE, lazy: 'manual' });
    expect(typeof (w.Chatly as { hasSession?: unknown } | undefined)?.hasSession).toBe('function');
    expect(loaderScripts()).toHaveLength(0);
  });

  it('takes the stand-in launcher down on unmount', () => {
    // Without the disarm, a React route change away from the widget leaves a
    // dead placeholder on the page and a live `pointerdown` listener on
    // `window` behind it.
    const handle = startWidget({}, { ...BASE, lazy: true });
    expect(placeholder()).not.toBeNull();
    handle.stop();
    vi.runAllTimers();
    expect(placeholder()).toBeNull();
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
