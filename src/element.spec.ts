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

import { defineChatlyWidget } from './element.js';
import { __testing } from './embed.js';

let calls: unknown[][] = [];

interface ShimWindow {
  Chatly?: ((...args: unknown[]) => void) & { q?: unknown[]; publicId?: string };
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
  it('re-dispatches widget events as bubbling DOM events', () => {
    document.body.innerHTML = '<chatly-widget public-id="acme-web"></chatly-widget>';
    const seen: unknown[] = [];
    // Listened for on `document`, which only works because they bubble and
    // are composed — a framework template binds on the element, but a page
    // that wants one listener for the whole app binds up here.
    document.addEventListener('chatly-ready', (e) => seen.push((e as CustomEvent).detail));
    for (const call of calls) {
      if (call[0] === 'on' && call[1] === 'ready') {
        (call[2] as (d: unknown) => void)({ contactId: 'c1', workspaceId: 'w1' });
      }
    }
    expect(seen).toEqual([{ contactId: 'c1', workspaceId: 'w1' }]);
  });
});
