/**
 * `<chatly-widget>`.
 *
 * The element's whole job is turning HTML into the lifecycle's options, so
 * most of what is worth pinning is that translation: a JSON attribute that
 * does not parse, a property set before the element was upgraded, and the two
 * things about inline mode that make the difference between a visible chat and
 * a zero-height box.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineChatlyWidget, ELEMENT_EVENTS } from './element.js';
import { __testing } from './embed.js';
import { domSuffix, WIDGET_EVENT_NAMES } from './events.js';

let calls: unknown[][] = [];

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & { q?: unknown[]; publicId?: string; nonce?: string };
}

const w = globalThis.window as unknown as ShimWindow;

function argsFor(method: string): unknown[][] {
  return calls.filter((c) => c[0] === method).map((c) => c.slice(1));
}

/** The options the element handed to `init`. */
function lastInit(): Record<string, unknown> {
  const init = argsFor('init');
  return (init[init.length - 1]?.[0] ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  __testing.reset();
  calls = [];
  w.Chatly = Object.assign((...args: unknown[]) => {
    calls.push(args);
  }, {});
  defineChatlyWidget();
});

afterEach(() => {
  __testing.reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('registration', () => {
  it('is idempotent', () => {
    // Two bundles each importing `/register` would otherwise throw
    // NotSupportedError and take the second bundle's module down with it.
    expect(() => {
      defineChatlyWidget();
      defineChatlyWidget();
    }).not.toThrow();
  });
});

describe('attributes', () => {
  it('maps kebab-case attributes onto the widget options', () => {
    document.body.innerHTML =
      '<chatly-widget public-id="acme-web" api-url="https://api.test" locale="fr"></chatly-widget>';
    expect(lastInit()).toEqual({ publicId: 'acme-web', apiUrl: 'https://api.test' });
    expect(argsFor('setLocale')).toEqual([['fr']]);
  });

  /*
   * `lazy` has no spread in HTML.
   *
   * An option missing from `ATTRIBUTES` typechecks, works in React (which
   * spreads props) and is simply unreachable from `<chatly-widget …>` — the
   * failure `check-widget-wrapper-parity.mjs` compares that table for. These
   * two pin the reachable part: that it arrives on the shim where the loader
   * reads it, and that a BARE attribute is not lost on the way.
   */
  it('reaches the loader shim, not the widget init', () => {
    document.body.innerHTML = '<chatly-widget public-id="acme-web" lazy="manual"></chatly-widget>';
    expect((w.Chatly as { lazy?: unknown } | undefined)?.lazy).toBe('manual');
    expect(lastInit()).toEqual({ publicId: 'acme-web' });
  });

  it('passes a valueless lazy attribute through as the empty string', () => {
    // Which the loader reads as "on" — HTML presence semantics. Coercing it
    // here would put a second interpreter of the same value in a second
    // package.
    document.body.innerHTML = '<chatly-widget public-id="acme-web" lazy></chatly-widget>';
    expect((w.Chatly as { lazy?: unknown } | undefined)?.lazy).toBe('');
  });

  /*
   * ── The CSP nonce ───────────────────────────────────────────────────
   *
   * Reachable from HTML (it is in `ATTRIBUTES`) and read through the IDL
   * property rather than `getAttribute`, because HTML blanks a nonce content
   * attribute on connection whenever the document carries a header-delivered
   * CSP — which is every page this option exists for.
   */
  it('carries a nonce attribute through to the shim and the injected script', () => {
    delete w.Chatly;
    document.head.innerHTML = '';
    document.body.innerHTML = '<chatly-widget public-id="acme-web" nonce="n0nce"></chatly-widget>';
    expect((globalThis.window as unknown as ShimWindow).Chatly?.nonce).toBe('n0nce');
    const script = document.head.querySelector('script[data-chatly-loader]');
    expect(script?.getAttribute('nonce')).toBe('n0nce');
  });

  it('reads the nonce PROPERTY when the browser has blanked the attribute', () => {
    /*
     * The real customer page, which no `getAttribute`-shaped read survives:
     * under a header-delivered CSP the nonce attribute is the empty string by
     * the time anything reads it, and the value lives only in the element's
     * internal slot. jsdom reflects the two onto each other, so the split is
     * constructed here.
     */
    delete w.Chatly;
    document.head.innerHTML = '';
    const el = document.createElement('chatly-widget');
    el.setAttribute('public-id', 'acme-web');
    Object.defineProperty(el, 'nonce', { value: 'hidden-nonce', configurable: true });
    el.setAttribute('nonce', '');
    document.body.appendChild(el);
    expect(el.getAttribute('nonce')).toBe('');
    expect((globalThis.window as unknown as ShimWindow).Chatly?.nonce).toBe('hidden-nonce');
    expect(document.head.querySelector('script[data-chatly-loader]')?.getAttribute('nonce')).toBe(
      'hidden-nonce',
    );
  });

  it('injects no nonce when the element carries none', () => {
    // The published absent-by-default behaviour, pinned rather than assumed.
    delete w.Chatly;
    document.head.innerHTML = '';
    document.body.innerHTML = '<chatly-widget public-id="acme-web"></chatly-widget>';
    const script = document.head.querySelector('script[data-chatly-loader]');
    expect(script?.hasAttribute('nonce')).toBe(false);
    expect((globalThis.window as unknown as ShimWindow).Chatly?.nonce).toBeUndefined();
  });

  it('parses a JSON attribute', () => {
    document.body.innerHTML = `<chatly-widget public-id="acme-web" theme='{"primaryColor":"#111111"}'></chatly-widget>`;
    expect(lastInit()['theme']).toEqual({ primaryColor: '#111111' });
  });

  it('drops a malformed JSON attribute, says which, and still starts the chat', () => {
    /*
     * The alternative — refusing to mount, the way the widget refuses a
     * `mountTo` selector that matched nothing — is the wrong trade here. A
     * broken `theme` leaves a WORKING chat in the default colours plus a named
     * error in the console; losing support chat on a customer's site over a
     * trailing comma does not.
     */
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.innerHTML = `<chatly-widget public-id="acme-web" theme='{"primaryColor":}'></chatly-widget>`;
    expect(error.mock.calls.flat().join(' ')).toContain('theme attribute');
    expect(lastInit()).toEqual({ publicId: 'acme-web' });
  });

  it('drops a JSON attribute that is not an object', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.innerHTML = `<chatly-widget public-id="acme-web" theme='7'></chatly-widget>`;
    expect(error.mock.calls.flat().join(' ')).toContain('must be an object');
    expect(lastInit()).toEqual({ publicId: 'acme-web' });
  });

  it('applies a changed attribute without being remounted', () => {
    document.body.innerHTML = '<chatly-widget public-id="acme-web"></chatly-widget>';
    const el = document.querySelector('chatly-widget');
    el?.setAttribute('locale', 'de');
    expect(argsFor('setLocale')).toEqual([['de']]);
    expect(argsFor('init')).toHaveLength(1);
  });
});

describe('properties', () => {
  it('prefers a property over the attribute of the same name', () => {
    document.body.innerHTML = `<chatly-widget public-id="acme-web" theme='{"primaryColor":"#111111"}'></chatly-widget>`;
    const el = document.querySelector('chatly-widget') as HTMLElement & {
      theme?: Record<string, unknown>;
    };
    el.theme = { primaryColor: '#222222' };
    expect(lastInit()['theme']).toEqual({ primaryColor: '#222222' });
  });

  it('keeps a property set BEFORE the element was upgraded', () => {
    /*
     * The pre-upgrade dance. `el.theme = {…}` on a not-yet-defined element
     * creates an own data property that shadows the prototype accessor for
     * good — the setter never runs and the theme is silently dropped. Every
     * property-binding template engine can produce this ordering.
     */
    const el = document.createElement('chatly-widget-late') as HTMLElement & {
      theme?: Record<string, unknown>;
    };
    el.theme = { primaryColor: '#333333' };
    el.setAttribute('public-id', 'acme-web');
    defineChatlyWidget('chatly-widget-late');
    document.body.appendChild(el);
    expect(lastInit()['theme']).toEqual({ primaryColor: '#333333' });
  });
});

describe('inline mounting', () => {
  it('mounts into the element itself and gives it a box', () => {
    /*
     * `display: block` is the difference between a chat panel and nothing at
     * all: a custom element is `display: inline` by default, which collapses
     * to zero height and looks exactly like the widget failing to load.
     */
    document.body.innerHTML = '<chatly-widget public-id="acme-web" inline></chatly-widget>';
    const el = document.querySelector('chatly-widget') as HTMLElement;
    expect(el.style.display).toBe('block');
    expect(el.style.minHeight).toBe('420px');
    expect(lastInit()['mountTo']).toBe(el);
  });

  it('leaves a height the author set alone', () => {
    document.body.innerHTML =
      '<chatly-widget public-id="acme-web" inline style="min-height: 100px"></chatly-widget>';
    expect((document.querySelector('chatly-widget') as HTMLElement).style.minHeight).toBe('100px');
  });

  it('does not pass mountTo when floating', () => {
    document.body.innerHTML = '<chatly-widget public-id="acme-web"></chatly-widget>';
    expect('mountTo' in lastInit()).toBe(false);
  });
});

describe('lifecycle', () => {
  it('survives being moved in the DOM', () => {
    // `appendChild` elsewhere fires disconnect THEN connect, and so does a
    // framework re-keying a list. Treating that as an unmount would re-boot
    // the visitor's session for a DOM move they cannot see.
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    const el = document.createElement('chatly-widget');
    el.setAttribute('public-id', 'acme-web');
    document.querySelector('#a')?.appendChild(el);
    document.querySelector('#b')?.appendChild(el);
    vi.advanceTimersByTime(50);
    expect(argsFor('init')).toHaveLength(1);
    expect(argsFor('destroy')).toHaveLength(0);
  });

  it('destroys when removed for good', () => {
    document.body.innerHTML = '<chatly-widget public-id="acme-web"></chatly-widget>';
    document.querySelector('chatly-widget')?.remove();
    vi.advanceTimersByTime(50);
    expect(argsFor('destroy')).toHaveLength(1);
  });
});

describe('events', () => {
  /** The widget-side subscriptions the element installed, by event name. */
  function subscriptions(): Map<string, Array<(detail: unknown) => void>> {
    const byEvent = new Map<string, Array<(detail: unknown) => void>>();
    for (const call of calls) {
      if (call[0] === 'on' && typeof call[1] === 'string') {
        const list = byEvent.get(call[1]) ?? [];
        list.push(call[2] as (detail: unknown) => void);
        byEvent.set(call[1], list);
      }
    }
    return byEvent;
  }

  it('re-dispatches widget events as bubbling DOM events', () => {
    document.body.innerHTML = '<chatly-widget public-id="acme-web"></chatly-widget>';
    const seen: unknown[] = [];
    // Listened for on `document`, which only works because they bubble and
    // are composed — a framework template binds on the element, but a page
    // that wants one listener for the whole app binds up here.
    document.addEventListener('chatly-ready', (e) => seen.push((e as CustomEvent).detail));
    for (const fire of subscriptions().get('ready') ?? []) {
      fire({ contactId: 'c1', workspaceId: 'w1' });
    }
    expect(seen).toEqual([{ contactId: 'c1', workspaceId: 'w1' }]);
  });

  /*
   * ── The one that would have caught the bug ────────────────────────────
   *
   * Three of the widget's twelve events — `message.ack`, `message.received`
   * and `unread` — were declared in `ChatlyEventName`, subscribable in
   * TypeScript, and forwarded by nothing. The test above passed throughout,
   * because it names one event.
   *
   * So the expected list is DERIVED, from `WIDGET_EVENT_NAMES`, which is
   * `Object.keys` of a map the compiler holds exhaustive against
   * `ChatlyEventName`. A hand-written list of twelve names here would pass
   * today and rot the next time the widget gains an event — which is exactly
   * how the nine became stale.
   *
   * The length floor is not decoration. If `EVENT_HANDLERS` were ever read as
   * empty, every assertion in this block would compare two empty sets and
   * report agreement — the shape this repo's gates have gone blind in twice.
   */
  it('forwards every event in the canonical list, derived not listed', () => {
    expect(WIDGET_EVENT_NAMES.length).toBeGreaterThanOrEqual(12);

    document.body.innerHTML = '<chatly-widget public-id="acme-web"></chatly-widget>';
    const installed = subscriptions();
    const seen: Array<[string, unknown]> = [];
    for (const name of WIDGET_EVENT_NAMES) {
      const type = `chatly-${domSuffix(name)}`;
      document.addEventListener(type, (e) => seen.push([type, (e as CustomEvent).detail]));
    }

    // Subscribed at all: a forwarder that is never installed cannot fire, and
    // the loop below would then simply see nothing.
    expect(WIDGET_EVENT_NAMES.filter((name) => !installed.has(name))).toEqual([]);

    for (const name of WIDGET_EVENT_NAMES) {
      for (const fire of installed.get(name) ?? []) {
        fire({ from: name });
      }
    }
    expect(seen).toEqual(
      WIDGET_EVENT_NAMES.map((name) => [`chatly-${domSuffix(name)}`, { from: name }]),
    );
  });

  it('exports ELEMENT_EVENTS as exactly the canonical set, both directions', () => {
    // `ELEMENT_EVENTS` is a published literal tuple, so it is written out
    // rather than derived — which means nothing but this compares it.
    expect([...ELEMENT_EVENTS].sort()).toEqual([...WIDGET_EVENT_NAMES].map(domSuffix).sort());
  });

  it('spells a dotted widget event with a dash, not a dot', () => {
    // `chatly-message.ack` is a legal DOM event name that Vue cannot bind:
    // `@chatly-message.ack` reads `ack` as an event modifier and listens for
    // `chatly-message` instead. Same reason the prefix is not `chatly:`.
    expect(domSuffix('message.ack')).toBe('message-ack');
    expect(domSuffix('message.received')).toBe('message-received');
    expect(ELEMENT_EVENTS.some((name) => name.includes('.'))).toBe(false);
  });
});
