/**
 * The embed lifecycle.
 *
 * Everything here is a failure a framework wrapper produces and a plain
 * snippet cannot: a double boot in StrictMode, a widget left behind on
 * unmount, a re-init triggered by a parent's re-render. There is no widget
 * bundle in these tests — `window.Chatly` is the callable shim the loader
 * installs, which is exactly what the lifecycle talks to on a real page
 * before the bundle lands.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { controls } from './controls.js';
import { __testing, startWidget, subscribe } from './embed.js';

import type { ChatlyEmbedOptions } from './types.js';

/** Every `Chatly(...)` dispatch, in order. */
let calls: unknown[][] = [];

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & { q?: unknown[]; publicId?: string; nonce?: string };
}

const w = globalThis.window as unknown as ShimWindow;

/** Stand in for the loader's shim, so every dispatch is observable. */
function installShim(): void {
  calls = [];
  w.Chatly = Object.assign((...args: unknown[]) => {
    calls.push(args);
  }, {});
}

/** The dispatches of one method name, with the method stripped. */
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

describe('booting', () => {
  it('initialises once, with the full options, and subscribes first', () => {
    startWidget({}, { ...BASE, theme: { primaryColor: '#111111' } });
    expect(argsFor('init')).toEqual([
      [{ publicId: 'acme-web', theme: { primaryColor: '#111111' } }],
    ]);
    // Subscribed BEFORE init: `open`, `message` and `error` are moments, and
    // a subscription that lands after boot misses them for good.
    const firstInit = calls.findIndex((c) => c[0] === 'init');
    const firstOn = calls.findIndex((c) => c[0] === 'on');
    expect(firstOn).toBeGreaterThanOrEqual(0);
    expect(firstOn).toBeLessThan(firstInit);
  });

  it('does not pass its own options through to the widget', () => {
    // `loaderUrl` and `locale` are this package's. A collision the day the
    // widget adds a key of either name would be invisible.
    startWidget({}, { ...BASE, loaderUrl: 'https://cdn.test/loader.js', locale: 'fr' });
    expect(argsFor('init')[0]?.[0]).toEqual({ publicId: 'acme-web' });
    expect(argsFor('setLocale')).toEqual([['fr']]);
  });

  it('refuses without a publicId, in the loader own words', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    startWidget({}, { publicId: '' });
    expect(warn.mock.calls.flat().join(' ')).toContain('missing publicId');
    expect(argsFor('init')).toEqual([]);
  });
});

describe('StrictMode and unmounting', () => {
  it('boots ONCE through mount / cleanup / mount', () => {
    /*
     * React 18 StrictMode in development runs every effect twice: mount,
     * cleanup, mount. A naive effect makes that init → destroy → init — two
     * sessions minted and a launcher that visibly flickers. The deferred
     * teardown is what collapses it back to one.
     */
    const claim = {};
    const first = startWidget(claim, BASE);
    first.stop();
    const second = startWidget(claim, BASE);
    vi.advanceTimersByTime(50);
    expect(argsFor('init')).toHaveLength(1);
    expect(argsFor('destroy')).toHaveLength(0);
    second.stop();
  });

  it('destroys on a real unmount, and unsubscribes', () => {
    const handle = startWidget({}, BASE);
    handle.stop();
    vi.advanceTimersByTime(50);
    expect(argsFor('destroy')).toHaveLength(1);
    // Every subscription is removed with the same function identity it was
    // added with, or the next boot double-fires every callback.
    expect(argsFor('off').length).toBe(argsFor('on').length);
  });

  it('survives while a second component still wants it', () => {
    const a = startWidget({}, BASE);
    const b = startWidget({}, BASE);
    a.stop();
    vi.advanceTimersByTime(50);
    expect(argsFor('destroy')).toHaveLength(0);
    b.stop();
    vi.advanceTimersByTime(50);
    expect(argsFor('destroy')).toHaveLength(1);
  });
});

describe('prop changes', () => {
  it('does not re-init when the options are the same by value', () => {
    // The whole point. A parent re-render produces a brand new `theme={{…}}`
    // literal every time; comparing by reference closes the visitor panel
    // mid-sentence.
    const handle = startWidget({}, { ...BASE, theme: { primaryColor: '#111111' } });
    handle.update({ ...BASE, theme: { primaryColor: '#111111' } });
    handle.update({ publicId: 'acme-web', theme: { primaryColor: '#111111' } });
    expect(argsFor('init')).toHaveLength(1);
  });

  it('re-inits when the theme actually changes', () => {
    const handle = startWidget({}, { ...BASE, theme: { primaryColor: '#111111' } });
    handle.update({ ...BASE, theme: { primaryColor: '#222222' } });
    expect(argsFor('init')).toHaveLength(2);
    expect(argsFor('init')[1]?.[0]).toEqual({
      publicId: 'acme-web',
      theme: { primaryColor: '#222222' },
    });
  });

  it('identifies instead of re-initialising when the visitor appears', () => {
    // A visitor who signs in after load. Re-initialising here would throw
    // away the conversation they have open.
    const handle = startWidget({}, BASE);
    handle.update({ ...BASE, visitor: { externalId: 'u_42' } });
    expect(argsFor('init')).toHaveLength(1);
    expect(argsFor('identify')).toEqual([[{ externalId: 'u_42' }]]);
  });

  it('resets when the visitor goes away, rather than keeping them signed in', () => {
    const handle = startWidget({}, { ...BASE, visitor: { externalId: 'u_42' } });
    handle.update(BASE);
    expect(argsFor('reset')).toHaveLength(1);
    expect(argsFor('init')).toHaveLength(1);
  });

  it('sets the locale without re-initialising', () => {
    const handle = startWidget({}, { ...BASE, locale: 'en' });
    handle.update({ ...BASE, locale: 'pt-BR' });
    expect(argsFor('init')).toHaveLength(1);
    expect(argsFor('setLocale')).toEqual([['en'], ['pt-BR']]);
  });

  it('refuses a loaderUrl change rather than half-applying it', () => {
    // The bundle is already fetched. Pointing the running widget at another
    // deployment needs a page reload; pretending otherwise would leave it
    // talking to the host it was loaded from while the props say otherwise.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = startWidget({}, { ...BASE, loaderUrl: 'https://a.test/loader.js' });
    handle.update({ ...BASE, loaderUrl: 'https://b.test/loader.js' });
    expect(warn.mock.calls.flat().join(' ')).toContain('needs a page reload');
  });

  it('starts the widget if update is somehow called first', () => {
    const handle = startWidget({}, BASE);
    handle.stop();
    vi.advanceTimersByTime(50);
    calls = [];
    handle.update(BASE);
    expect(argsFor('init')).toHaveLength(1);
  });
});

describe('two mounted components', () => {
  it('warns that the first one owns the configuration', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    startWidget({}, { ...BASE, theme: { primaryColor: '#111111' } });
    startWidget({}, { ...BASE, theme: { primaryColor: '#222222' } });
    expect(warn.mock.calls.flat().join(' ')).toContain('FIRST mount owns the configuration');
    // And it really is ignored, rather than silently winning.
    expect(argsFor('init')).toHaveLength(1);
  });

  it('is silent when both ask for the same thing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    startWidget({}, BASE);
    startWidget({}, BASE);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('events', () => {
  /** Fire the widget-side subscription for `event`. */
  function emit(event: string, detail: unknown): void {
    for (const call of calls) {
      if (call[0] === 'on' && call[1] === event) {
        (call[2] as (d: unknown) => void)(detail);
      }
    }
  }

  it('reaches every mounted claim, not only the owner', () => {
    const seen: string[] = [];
    startWidget({}, BASE, { onReady: () => seen.push('a') });
    startWidget({}, BASE, { onReady: () => seen.push('b') });
    emit('ready', { contactId: null, workspaceId: 'w1' });
    expect(seen.sort()).toEqual(['a', 'b']);
  });

  it('does not let one throwing handler stop the others', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const seen: string[] = [];
    startWidget({}, BASE, {
      onMessage: () => {
        throw new Error('host bug');
      },
    });
    startWidget({}, BASE, { onMessage: () => seen.push('b') });
    emit('message', { id: 'm1', body: 'hi', authorType: 'agent' });
    expect(seen).toEqual(['b']);
    expect(warn.mock.calls.flat().join(' ')).toContain('threw');
  });

  it('hands back an unsubscribe that is idempotent', () => {
    startWidget({}, BASE);
    const stop = subscribe('message', () => undefined);
    stop();
    stop();
    expect(argsFor('off').filter((a) => a[0] === 'message')).toHaveLength(1);
  });
});

describe('the loader script', () => {
  it('is injected once, from the url it was given', () => {
    delete w.Chatly;
    startWidget({}, { ...BASE, loaderUrl: 'https://cdn.test/loader.js' });
    startWidget({}, { ...BASE, loaderUrl: 'https://cdn.test/loader.js' });
    const scripts = [...document.head.querySelectorAll('script[data-chatly-loader]')];
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).src).toBe('https://cdn.test/loader.js');
  });

  it('queues the init onto the shim it installs, for the loader to replay', () => {
    delete w.Chatly;
    startWidget({}, BASE);
    // Re-read through the window: `delete` narrows `w.Chatly` to `never`, and
    // the shim this installs is a different object from the one above.
    const installed = (globalThis.window as unknown as ShimWindow).Chatly;
    const queued = (installed?.q ?? []) as unknown[][];
    expect(queued.some((args) => args[0] === 'init')).toBe(true);
  });

  it('leaves loading to the page when a snippet is already there', () => {
    // `window.Chatly` exists, so the host pasted the snippet and its loader is
    // on its way. A second script tag would fetch the bundle twice.
    startWidget({}, BASE);
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });

  /*
   * ── The CSP nonce ───────────────────────────────────────────────────
   *
   * A host page served `script-src 'nonce-X'` with no `'unsafe-inline'` runs
   * a script only if it carries X. These assert on the ATTRIBUTE of the
   * element that was actually injected, not on a value having been passed
   * along — the whole bug class here is a nonce that reaches the wrapper and
   * never reaches the DOM.
   */
  it('stamps the nonce on the script it injects', () => {
    delete w.Chatly;
    startWidget({}, { ...BASE, nonce: 'n0nce', loaderUrl: 'https://cdn.test/loader.js' });
    const script = document.head.querySelector('script[data-chatly-loader]');
    expect(script?.getAttribute('nonce')).toBe('n0nce');
    // And the property, which is what the browser's CSP check actually reads
    // and the only half that survives nonce-hiding.
    expect((script as HTMLScriptElement | null)?.nonce).toBe('n0nce');
  });

  it('injects exactly what it always did when no nonce is given', () => {
    // Both packages are published. The absent-by-default behaviour has to be
    // identical, so this pins the no-nonce case rather than assuming it.
    delete w.Chatly;
    startWidget({}, { ...BASE, loaderUrl: 'https://cdn.test/loader.js' });
    const script = document.head.querySelector('script[data-chatly-loader]');
    expect(script?.hasAttribute('nonce')).toBe(false);
    expect((w.Chatly as { nonce?: string } | undefined)?.nonce).toBeUndefined();
  });

  it('has the nonce in place BEFORE the loader script is appended', () => {
    /*
     * Both halves have to be true at the moment of insertion, and both look
     * identical afterwards — which is why this inspects the insertion rather
     * than the end state.
     *
     *   - the SCRIPT's own nonce, because the CSP check runs on insertion. A
     *     nonce assigned after `appendChild` is one the browser never saw,
     *     and the DOM looks the same.
     *   - the SHIM's, because the loader stamps `widget.js` from
     *     `window.Chatly.nonce` as its own script evaluates, so a write that
     *     lands later is a write it may never read.
     */
    delete w.Chatly;
    let shimNonce: unknown = 'never appended';
    let scriptNonce: unknown = 'never appended';
    const append = vi
      .spyOn(document.head, 'appendChild')
      .mockImplementation(<T extends Node>(node: T): T => {
        shimNonce = (globalThis.window as unknown as ShimWindow).Chatly?.nonce;
        scriptNonce = (node as unknown as HTMLScriptElement).getAttribute('nonce');
        return node;
      });
    startWidget({}, { ...BASE, nonce: 'n0nce' });
    expect(append).toHaveBeenCalled();
    expect(shimNonce).toBe('n0nce');
    expect(scriptNonce).toBe('n0nce');
  });

  it('keeps the nonce out of the widget init options', () => {
    // It is the loader's and the bundle's, carried on the shim. Passing it
    // through `init` as well would be a collision the day the widget adds a
    // key of that name — the same reason `lazy` is stripped.
    startWidget({}, { ...BASE, nonce: 'n0nce' });
    expect(argsFor('init')[0]?.[0]).toEqual({ publicId: 'acme-web' });
  });

  it('refuses a nonce change rather than pretending to re-stamp', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handle = startWidget({}, { ...BASE, nonce: 'first' });
    handle.update({ ...BASE, nonce: 'second' });
    expect(warn.mock.calls.flat().join(' ')).toMatch(/nonce changed/);
    // And no re-init: a nonce is per-response, and re-mounting the widget
    // would not re-stamp a script the browser has already evaluated.
    expect(argsFor('init')).toHaveLength(1);
  });

  it('says so when the loader cannot be fetched, instead of nothing at all', () => {
    delete w.Chatly;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    startWidget({}, { ...BASE, loaderUrl: 'https://cdn.test/loader.js' });
    document.head.querySelector('script')?.dispatchEvent(new Event('error'));
    expect(warn.mock.calls.flat().join(' ')).toMatch(/loader failed to load/);
  });
});

describe('controls', () => {
  it('warns rather than throwing when nothing is mounted', () => {
    // A header button wired to open() on a page with no widget. Throwing here
    // would break the host page's click handler.
    delete w.Chatly;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => controls.open()).not.toThrow();
    expect(warn.mock.calls.flat().join(' ')).toContain('no widget is mounted');
  });

  it('dispatches through the callable form, which works queued or live', () => {
    startWidget({}, BASE);
    controls.open('help');
    controls.track('pricing_viewed', { plan: 'pro' });
    expect(argsFor('open')).toEqual([['help']]);
    expect(argsFor('track')).toEqual([['pricing_viewed', { plan: 'pro' }]]);
  });

  /*
   * NCH-22. On `controls` rather than exempted from the parity gate the way
   * `mount` is: this moves inline properties on an element that is already
   * mounted and touches nothing `embed.ts`'s reference count owns. The
   * assertion is on what was SENT — the method name and the object, verbatim
   * — because a wrapper that forwarded `{ panelY }` as `panelOffsetY` would
   * pass any test written against a canned reply.
   */
  it('forwards setOffset verbatim, so a custom launcher can move the panel', () => {
    startWidget({}, BASE);
    controls.setOffset({ y: 120, panelY: 60 });
    expect(argsFor('setOffset')).toEqual([[{ y: 120, panelY: 60 }]]);
  });
});
