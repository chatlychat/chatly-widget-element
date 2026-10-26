/**
 * The identity loop (CHT-D10).
 *
 * ═══ WHAT THESE TESTS ASSERT ON, AND WHY IT MATTERS ═══════════════════════
 *
 * Every test below asserts on **what the loop dispatched** and **what it put
 * on the wire** — never on a canned reply. That is not a style preference. A
 * fake transport that answers every request with a plausible shape AGREES
 * WITH THE BUG: four mobile SDKs here shipped an unusable realtime handshake
 * with green suites because their fakes echoed whatever the SDK asked for.
 * So the `identityEndpoint` tests read the `fetch` init object and check for
 * `cache: 'no-store'`, and the provider tests read the recorded dispatches.
 *
 * ═══ THE CONTROLS ═════════════════════════════════════════════════════════
 *
 * The central rule — only an explicit `null` signs the visitor out — is a
 * claim about what does NOT happen, and a test that only checks the happy
 * path passes against an implementation that resets on everything. So each
 * refusal is paired with its control:
 *
 *   - a provider that throws dispatches nothing … and `null` DOES reset;
 *   - a 500 dispatches nothing … and a 200 with `{identity: null}` resets;
 *   - `null` with nothing stored dispatches nothing … and with a stored
 *     external id it resets.
 *
 * Deleting the pair is how you find out the gate was measuring the control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  identityProviderFor,
  normalizeAnswer,
  startIdentityLoop,
  withResolvedIdentity,
  type ChatlyIdentityAnswer,
  type IdentityLoop,
} from './identity-loop.js';

import type { ChatlyEmbedOptions, ChatlyIdentity } from './types.js';

const PUBLIC_ID = 'acme-web';
const KEY = `chatly:xid:${PUBLIC_ID}`;

/**
 * A `localStorage` of our own, because this suite has none.
 *
 * Worth knowing rather than working around silently: jsdom 30 under Node does
 * NOT provide `window.localStorage` here — the run prints `localStorage is not
 * available because --localstorage-file was not provided`, and
 * `typeof window.localStorage` is `'undefined'`. So every test in this package
 * that touches the key the loop compares against would be reading `undefined`
 * and taking the guarded branch, which is the shape of test that passes
 * against an implementation that never reads storage at all.
 *
 * Installing a working store is therefore part of the assertion, not setup
 * noise. The guarded branch is still covered, deliberately, by the test that
 * makes `getItem` throw.
 */
const STORE = new Map<string, string>();

const FAKE_STORAGE = {
  getItem: (key: string): string | null => STORE.get(key) ?? null,
  setItem: (key: string, value: string): void => void STORE.set(key, value),
  removeItem: (key: string): void => void STORE.delete(key),
  clear: (): void => STORE.clear(),
  key: (index: number): string | null => [...STORE.keys()][index] ?? null,
  get length(): number {
    return STORE.size;
  },
};

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  get: () => FAKE_STORAGE,
});

/** Every `(method, identity?)` the loop asked for, in order. */
let dispatched: Array<[string, ChatlyIdentity | undefined]> = [];
let loops: IdentityLoop[] = [];

function start(options: Partial<ChatlyEmbedOptions>): IdentityLoop {
  const loop = startIdentityLoop(
    { publicId: PUBLIC_ID, ...options } as ChatlyEmbedOptions,
    (method, identity) => dispatched.push([method, identity]),
  );
  if (loop === null) {
    throw new Error('the test configured no provider');
  }
  loops.push(loop);
  return loop;
}

/** Let the provider's promise chain settle. Two turns: `then` then `finally`. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  dispatched = [];
  loops = [];
  window.localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const loop of loops) {
    loop.stop();
  }
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('normalizeAnswer', () => {
  it('reads the documented envelope and a bare identity the same way', () => {
    const bare = { externalId: 'u_1', email: 'a@b.test' };
    expect(normalizeAnswer({ identity: bare })).toEqual(bare);
    expect(normalizeAnswer(bare)).toEqual(bare);
  });

  it('reads both spellings of a sign-out as null', () => {
    expect(normalizeAnswer({ identity: null })).toBeNull();
    expect(normalizeAnswer(null)).toBeNull();
  });

  it('refuses a body with no identity key — that is a misconfigured route', () => {
    /*
     * The route answered 200 with something else: a login page, a framework
     * error envelope, an older version of the route. Reading it as a sign-out
     * would reset every visitor on the site the moment the route moved.
     */
    expect(normalizeAnswer({ user: { id: 'u_1' } })).toBeUndefined();
    expect(normalizeAnswer({})).toBeUndefined();
  });

  it('refuses an identity with no externalId', () => {
    /*
     * `externalId` is the only field contacts are matched on. `{email}` alone
     * would attach that email to whichever contact this browser's session
     * already holds — somebody else's, on a shared device.
     */
    expect(normalizeAnswer({ identity: { email: 'a@b.test' } })).toBeUndefined();
    expect(normalizeAnswer({ identity: { externalId: '' } })).toBeUndefined();
  });

  it('refuses a non-object answer', () => {
    expect(normalizeAnswer('ok')).toBeUndefined();
    expect(normalizeAnswer(204)).toBeUndefined();
    expect(normalizeAnswer(undefined)).toBeUndefined();
    expect(normalizeAnswer({ identity: 'u_1' })).toBeUndefined();
  });
});

describe('identityProviderFor', () => {
  it('is null when neither option is set — no loop, no listener', () => {
    expect(identityProviderFor({ publicId: PUBLIC_ID })).toBeNull();
    expect(identityProviderFor({ publicId: PUBLIC_ID, identityEndpoint: '' })).toBeNull();
    expect(
      startIdentityLoop({ publicId: PUBLIC_ID }, () => undefined),
    ).toBeNull();
  });

  it('prefers the callback over the endpoint, and says so', () => {
    // Silently preferring one is how a host ends up debugging a route that is
    // never called.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const identity = (): null => null;
    expect(
      identityProviderFor({ publicId: PUBLIC_ID, identity, identityEndpoint: '/id' }),
    ).toBe(identity);
    expect(warn.mock.calls.flat().join(' ')).toContain('identityEndpoint is ignored');
  });
});

describe('at boot', () => {
  it('identifies the visitor the provider names', async () => {
    const user = { externalId: 'u_1', email: 'a@b.test', userHash: 'h1' };
    start({ identity: () => ({ identity: user }) });
    await settle();
    expect(dispatched).toEqual([['identify', user]]);
  });

  it('awaits an async provider', async () => {
    const user = { externalId: 'u_1' };
    start({ identity: async () => Promise.resolve({ identity: user }) });
    await settle();
    expect(dispatched).toEqual([['identify', user]]);
  });

  it('resets when the visitor is signed out AND somebody is remembered', async () => {
    window.localStorage.setItem(KEY, 'u_1');
    start({ identity: () => ({ identity: null }) });
    await settle();
    expect(dispatched).toEqual([['reset', undefined]]);
  });

  it('does NOT reset a signed-out visitor with nothing remembered', async () => {
    /*
     * The control for over-reach, and a real regression if it fails. An
     * anonymous visitor may be mid-conversation: the widget keeps that
     * session deliberately, so the thread follows them onto their contact if
     * they sign in. A `reset()` on every signed-out page load would throw it
     * away each visit.
     */
    start({ identity: () => ({ identity: null }) });
    await settle();
    expect(dispatched).toEqual([]);
  });

  it('identifies the new person on an account change, with no reset first', async () => {
    /*
     * ═══ THE ACCEPTANCE CRITERION ═════════════════════════════════════════
     *
     * Referalli's own `referally_chat_account` key existed to spot this, and
     * deleting it has to leave the behaviour intact. The loop compares
     * against `chatly:xid:<publicId>` — the widget's own record, already in
     * the public storage manifest and the channel's storage declaration — so
     * the host key is redundant rather than merely unfashionable.
     *
     * EXACTLY ONE dispatch, and it is the `identify`. A `reset()` first would
     * boot a fresh anonymous session, cost an extra round trip and flash an
     * anonymous widget — and it is unnecessary, because
     * `VisitorTokens.forgetIfAnotherPerson` (called from `WidgetClient.init`,
     * which an `identify()` goes through) drops the previous person's token,
     * hash, external id and unread watermark BEFORE the request goes out.
     */
    window.localStorage.setItem(KEY, 'u_A');
    const user = { externalId: 'u_B', userHash: 'h_B' };
    start({ identity: () => ({ identity: user }) });
    await settle();
    expect(dispatched).toEqual([['identify', user]]);
  });

  it('survives localStorage throwing, and does not reset on a sign-out then', async () => {
    /*
     * `localStorage` is not a property read: in a private window, on an
     * opaque origin or with site data blocked, touching it THROWS. A host
     * page must not lose its chat over a browser setting — and the failure
     * answer must be the safe one, which is "nothing is remembered".
     */
    const getItem = vi
      .spyOn(window.localStorage, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    start({ identity: () => ({ identity: null }) });
    await settle();
    expect(getItem).toHaveBeenCalled();
    expect(dispatched).toEqual([]);
  });
});

describe('only an explicit null signs the visitor out', () => {
  it('changes nothing when the provider throws', async () => {
    window.localStorage.setItem(KEY, 'u_1');
    start({
      identity: () => {
        throw new Error('auth service down');
      },
    });
    await settle();
    expect(dispatched).toEqual([]);
  });

  it('changes nothing when the provider rejects', async () => {
    window.localStorage.setItem(KEY, 'u_1');
    start({ identity: () => Promise.reject(new Error('502')) });
    await settle();
    expect(dispatched).toEqual([]);
  });

  it('but DOES reset on a real null — the control for the two above', async () => {
    window.localStorage.setItem(KEY, 'u_1');
    start({ identity: () => null });
    await settle();
    expect(dispatched).toEqual([['reset', undefined]]);
  });

  it('never lets a rejection escape to the host page', async () => {
    /*
     * `void somePromise` is NOT a catch: a rejection there reaches the
     * customer's page as an unhandled rejection, and their own error reporter
     * attributes it to us. 28 of those were swept out of this repo once.
     */
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    start({ identity: () => Promise.reject(new Error('boom')) });
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('identityEndpoint', () => {
  function stubFetch(
    answer: { status?: number; body?: unknown } = {},
  ): ReturnType<typeof vi.fn> {
    const fetcher = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve({
        ok: (answer.status ?? 200) < 400,
        status: answer.status ?? 200,
        json: () => Promise.resolve(answer.body ?? { identity: null }),
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    return fetcher as unknown as ReturnType<typeof vi.fn>;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches with cache: no-store — asserted on the REQUEST', async () => {
    /*
     * The one assertion in this file that could not be made against a canned
     * reply, and the one that matters most: an identity response a browser, a
     * service worker or a CDN may reuse is one visitor's account served to
     * the next one on a shared device.
     */
    const fetcher = stubFetch({ body: { identity: { externalId: 'u_1' } } });
    start({ identityEndpoint: '/api/chatly/identity' });
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chatly/identity');
    expect(init.cache).toBe('no-store');
    expect(dispatched).toEqual([['identify', { externalId: 'u_1' }]]);
  });

  it('changes nothing on a 500 — a bad minute is not a sign-out', async () => {
    window.localStorage.setItem(KEY, 'u_1');
    stubFetch({ status: 500, body: {} });
    start({ identityEndpoint: '/api/chatly/identity' });
    await settle();
    expect(dispatched).toEqual([]);
  });

  it('resets on a 200 answering {identity: null} — the control', async () => {
    window.localStorage.setItem(KEY, 'u_1');
    stubFetch({ status: 200, body: { identity: null } });
    start({ identityEndpoint: '/api/chatly/identity' });
    await settle();
    expect(dispatched).toEqual([['reset', undefined]]);
  });
});

describe('on visibilitychange', () => {
  /** jsdom's `visibilityState` is a getter on the prototype. */
  function setVisibility(state: 'visible' | 'hidden'): void {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
  }

  afterEach(() => {
    setVisibility('visible');
  });

  it('re-asks, and resets when the visitor signed out in another tab', async () => {
    /*
     * The case the hand-written loops existed for. `visibilitychange` is the
     * only event that fires for it: `focus` misses a tab switch within one
     * window on some browsers, and `pageshow` fires only on a back/forward
     * restore.
     */
    let answer: ChatlyIdentityAnswer = { identity: { externalId: 'u_1' } };
    start({ identity: () => answer });
    await settle();
    // The widget stored the person it was verified as, as it would on a page.
    window.localStorage.setItem(KEY, 'u_1');
    dispatched = [];

    answer = { identity: null };
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(dispatched).toEqual([['reset', undefined]]);
  });

  it('does not re-identify the same person on every tab focus', async () => {
    /*
     * Without the dedupe this is a POST to `/v1/widget/init` every time the
     * visitor glances at another tab and comes back.
     */
    const user = { externalId: 'u_1', email: 'a@b.test' };
    start({ identity: () => ({ identity: user }) });
    await settle();
    window.localStorage.setItem(KEY, 'u_1');
    dispatched = [];

    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(dispatched).toEqual([]);
  });

  it('DOES push a changed email on the same account — the dedupe control', async () => {
    let user: ChatlyIdentity = { externalId: 'u_1', email: 'old@b.test' };
    start({ identity: () => ({ identity: user }) });
    await settle();
    window.localStorage.setItem(KEY, 'u_1');
    dispatched = [];

    user = { externalId: 'u_1', email: 'new@b.test' };
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(dispatched).toEqual([['identify', { externalId: 'u_1', email: 'new@b.test' }]]);
  });

  it('re-identifies when something else reset the widget underneath it', async () => {
    /*
     * The second half of the dedupe, and the reason it re-reads storage
     * rather than trusting its own memory: a `reset()` from the host's own
     * sign-out button, or a session the server refused, clears
     * `chatly:xid:` — and a loop that only compared its last answer would
     * believe the visitor was still identified and never re-assert it.
     */
    const user = { externalId: 'u_1' };
    start({ identity: () => ({ identity: user }) });
    await settle();
    window.localStorage.setItem(KEY, 'u_1');
    dispatched = [];

    window.localStorage.removeItem(KEY);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(dispatched).toEqual([['identify', user]]);
  });

  it('asks nothing as the visitor LEAVES', async () => {
    // The event fires on the way out too, and nobody reads that answer.
    const provider = vi.fn(() => ({ identity: { externalId: 'u_1' } }));
    start({ identity: provider });
    await settle();
    expect(provider).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('stop() removes the listener', async () => {
    const provider = vi.fn(() => ({ identity: { externalId: 'u_1' } }));
    const loop = start({ identity: provider });
    await settle();
    loop.stop();

    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(provider).toHaveBeenCalledTimes(1);
  });
});

describe('ordering and coalescing', () => {
  it('ignores an answer that resolves after a newer request went out', async () => {
    /*
     * Two `visibilitychange` events a few hundred milliseconds apart can
     * genuinely resolve out of order, and applying the older one would
     * identify the visitor as whoever they were a moment ago.
     *
     * The first answer is held open; the loop is told to stop in between, so
     * the generation counter has moved by the time it lands.
     */
    let release: (value: ChatlyIdentityAnswer) => void = () => undefined;
    const loop = start({
      identity: () =>
        new Promise<ChatlyIdentityAnswer>((resolve) => {
          release = resolve;
        }),
    });
    loop.stop();
    release({ identity: { externalId: 'u_stale' } });
    await settle();
    expect(dispatched).toEqual([]);
  });

  it('coalesces a refresh while one is in flight', async () => {
    let release: (value: ChatlyIdentityAnswer) => void = () => undefined;
    const provider = vi.fn(
      () =>
        new Promise<ChatlyIdentityAnswer>((resolve) => {
          release = resolve;
        }),
    );
    const loop = start({ identity: provider });
    /*
     * One microtask first, and the reason is worth recording: the provider is
     * NEVER called synchronously from `startIdentityLoop`. It runs inside a
     * `Promise.resolve().then(…)`, so that a synchronous throw lands in the
     * same `.catch` as a rejection rather than escaping into `boot()` and
     * taking the widget's mount down with it. An assertion made before this
     * await reads zero calls and says nothing about coalescing.
     */
    await Promise.resolve();
    expect(provider).toHaveBeenCalledTimes(1);

    loop.refresh();
    loop.refresh();
    await Promise.resolve();
    expect(provider).toHaveBeenCalledTimes(1);

    release({ identity: { externalId: 'u_1' } });
    await settle();
    expect(dispatched).toEqual([['identify', { externalId: 'u_1' }]]);
  });
});

describe('update', () => {
  it('refreshes when the provider changed', async () => {
    const first = vi.fn(() => ({ identity: { externalId: 'u_1' } }));
    const second = vi.fn(() => ({ identity: { externalId: 'u_2' } }));
    const loop = start({ identity: first });
    await settle();
    window.localStorage.setItem(KEY, 'u_1');
    dispatched = [];

    loop.update({ publicId: PUBLIC_ID, identity: second } as ChatlyEmbedOptions);
    await settle();
    expect(second).toHaveBeenCalledTimes(1);
    expect(dispatched).toEqual([['identify', { externalId: 'u_2' }]]);
  });

  it('stops asking when the option is removed, and does NOT sign the visitor out', async () => {
    /*
     * Removing the option is not a statement about who is signed in. A host
     * that conditionally renders `identityEndpoint` must not log its visitor
     * out of chat by doing so.
     */
    const provider = vi.fn(() => ({ identity: { externalId: 'u_1' } }));
    const loop = start({ identity: provider });
    await settle();
    window.localStorage.setItem(KEY, 'u_1');
    dispatched = [];

    loop.update({ publicId: PUBLIC_ID } as ChatlyEmbedOptions);
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(provider).toHaveBeenCalledTimes(1);
    expect(dispatched).toEqual([]);
  });
});

describe('withResolvedIdentity', () => {
  it('leaves visitor alone until an answer has arrived', () => {
    const init = { publicId: PUBLIC_ID, visitor: { externalId: 'u_prop' } };
    expect(withResolvedIdentity(init, undefined)).toEqual(init);
  });

  it('substitutes the resolved person, so a re-init is never a step backwards', () => {
    const init = { publicId: PUBLIC_ID, visitor: { externalId: 'u_prop' } };
    expect(withResolvedIdentity(init, { externalId: 'u_live' })).toEqual({
      publicId: PUBLIC_ID,
      visitor: { externalId: 'u_live' },
    });
  });

  it('REMOVES visitor for a signed-out answer rather than setting it undefined', () => {
    /*
     * The widget's own `reset()` drops `visitor` from the options it
     * remembers, so an init that names nobody must not carry an empty
     * identity object either — `{visitor: undefined}` would be serialised as
     * a present-but-empty identity by a host that spreads it.
     */
    const result = withResolvedIdentity(
      { publicId: PUBLIC_ID, visitor: { externalId: 'u_prop' } },
      null,
    );
    expect(result).toEqual({ publicId: PUBLIC_ID });
    expect('visitor' in result).toBe(false);
  });
});
