/**
 * One widget, many claimants — the lifecycle both wrappers share.
 *
 * ── What problem this solves ────────────────────────────────────────────
 *
 * `window.Chatly` is a SINGLETON. `init()` destroys whatever is mounted and
 * mounts again; `destroy()` removes it outright. A framework wrapper is the
 * opposite shape: components mount, unmount, re-render with new props, and in
 * React 18 StrictMode every effect runs mount → cleanup → mount again before
 * the user has done anything at all.
 *
 * Handing that directly to `init`/`destroy` produces three bugs, all of which
 * look like the widget being flaky rather than the wrapper being wrong:
 *
 *   1. **StrictMode double-boot.** mount/cleanup/mount with a naive effect is
 *      init → destroy → init: two `POST /v1/widget/init` round trips, two
 *      sessions minted, and a launcher that visibly appears, vanishes and
 *      reappears in development.
 *   2. **A leak on unmount.** An effect with no cleanup leaves the widget in
 *      the DOM after its component is gone — it survives route changes it
 *      should not, holds its socket, and a later mount `init`s a second one
 *      on top.
 *   3. **Re-init on every render.** Comparing props by reference re-inits
 *      whenever a parent re-renders with a fresh `theme={{…}}` literal or a
 *      new inline `onMessage` arrow. The visitor's open panel closes mid
 *      sentence.
 *
 * So: a reference count with a DEFERRED teardown, a structural comparison of
 * the options, and ONE stable set of event forwarders installed at boot that
 * fan out to whatever each claimant most recently passed.
 *
 * ── Deliberately not exported ───────────────────────────────────────────
 *
 * `init` and `destroy` are absent from `controls`. A host that calls them
 * behind this module's back desynchronises the count — the widget is gone and
 * the wrapper still believes it is mounted, so the next unmount is a no-op and
 * the next mount does nothing. Mount with a wrapper or mount with the snippet;
 * not both.
 */
import { resetConflictWarning, warnOnConflict } from './conflict-warning.js';
import { warnLateBootOption } from './lazy.js';
import { sameOptions, sameValue } from './same-value.js';

import type {
  ChatlyEmbedHandlers,
  ChatlyEmbedOptions,
  ChatlyEventName,
  ChatlyIdentity,
  ChatlyInitOptions,
  ChatlyLazyMode,
  ChatlyMessageEvent,
  ChatlySession,
} from './types.js';

/** Where we serve the loader. Override only to serve it yourself — see the type. */
export const DEFAULT_LOADER_URL = 'https://widget.chatlychat.com/loader.js';

/**
 * The shape of `window.Chatly` this module relies on, and only that.
 *
 * It is BOTH callable (`Chatly('open')`, the snippet idiom, which the loader
 * shim also answers to before the bundle lands) and an object of methods once
 * the bundle has installed itself. Everything here goes through the callable
 * form on purpose: it is the one spelling that works in both states, so a
 * wrapper never has to care whether the bundle has arrived.
 */
interface ChatlyGlobalShim {
  (...args: unknown[]): void;
  q?: unknown[];
  publicId?: string;
  apiUrl?: string;
  bundleUrl?: string;
  /**
   * Read by `loader.js` at script-evaluation time, not passed to `init`. A
   * shim PROPERTY rather than an init option for the same reason `publicId`
   * is one: the loader decides whether to fetch the bundle before it can call
   * anything on it, so the answer has to be sitting on the global already.
   */
  lazy?: ChatlyLazyMode;
  /** Present only once the bundle has loaded. Used as "is it up yet". */
  init?: (opts: ChatlyInitOptions) => void;
}

interface EmbedWindow {
  Chatly?: ChatlyGlobalShim;
}

function embedWindow(): EmbedWindow | null {
  // Guarded rather than assumed: this module is imported by a React component
  // that may be rendered on a server, and `startWidget` is the only thing that
  // must be browser-only. A null here is a clear refusal instead of a
  // ReferenceError inside someone's SSR build.
  return typeof window === 'undefined' ? null : (window as unknown as EmbedWindow);
}

/** One mount request. The first one to arrive owns the configuration. */
interface Claim {
  options: ChatlyEmbedOptions;
  handlers: ChatlyEmbedHandlers;
}

/** Everything about the single mounted widget. Null when nothing is mounted. */
interface MountState {
  /** Insertion-ordered, so the owner is `claims.keys().next().value`. */
  claims: Map<object, Claim>;
  /** The options the widget was actually initialised with. */
  active: ChatlyEmbedOptions;
  /** The loader URL used, so a later claim asking for a different one warns. */
  loaderUrl: string;
  /** Likewise: read once by loader.js, so a later change can only warn. */
  lazy: ChatlyLazyMode | undefined;
  /** Pending deferred teardown, cancelled by a remount. See `release`. */
  teardown: ReturnType<typeof setTimeout> | null;
}

let state: MountState | null = null;

/** True once THIS module injected a loader script, so it never injects twice. */
let injectedLoader = false;

export interface ChatlyEmbedHandle {
  /**
   * Re-apply props. Cheap when nothing material changed — which is the common
   * case, because a parent re-render produces new object literals with the
   * same contents.
   */
  update: (options: ChatlyEmbedOptions, handlers?: ChatlyEmbedHandlers) => void;
  /** Give up this claim. The widget is torn down when the last one goes. */
  stop: () => void;
}

/**
 * Mount the widget, or join the one that is already mounted.
 *
 * `claim` is any object identity — a component instance, an element, a
 * `{}` — and it is what `stop()` releases. Two claims from the same owner are
 * one claim, which is what makes a React effect that re-runs idempotent.
 */
export function startWidget(
  claim: object,
  options: ChatlyEmbedOptions,
  handlers: ChatlyEmbedHandlers = {},
): ChatlyEmbedHandle {
  const handle: ChatlyEmbedHandle = {
    update: (next, nextHandlers) => applyUpdate(claim, next, nextHandlers ?? {}),
    stop: () => release(claim),
  };

  if (embedWindow() === null) {
    // Server-side. Return a handle whose methods are inert rather than
    // throwing: a component that renders on the server and hydrates in the
    // browser calls this from an effect, and an effect never runs on the
    // server — but a defensive caller should not have to know that.
    return handle;
  }

  if (typeof options.publicId !== 'string' || options.publicId.length === 0) {
    // The loader's own message for the same mistake, so an embedder searching
    // for it finds one answer rather than two.
    console.warn('[Chatly] missing publicId — widget not started');
    return handle;
  }

  if (state !== null) {
    if (state.teardown !== null) {
      /*
       * A teardown was scheduled and a mount came back before it ran. This is
       * StrictMode's cleanup/re-mount pair, and a route change that swaps
       * which component owns the widget lands here too. Cancelling it is the
       * whole point: the visitor's session, open panel and scroll position
       * survive something that was never a real unmount.
       */
      clearTimeout(state.teardown);
      state.teardown = null;
    }
    warnOnConflict(state, options, initOptionsFor);
    state.claims.set(claim, { options, handlers });
    reconcile();
    return handle;
  }

  state = {
    claims: new Map([[claim, { options, handlers }]]),
    active: options,
    loaderUrl: options.loaderUrl ?? DEFAULT_LOADER_URL,
    lazy: options.lazy,
    teardown: null,
  };
  boot(state);
  return handle;
}

/** Warned once per page: two mounted widgets asking for different things. */

/** Install the shim, subscribe, queue the init, and fetch the loader. */
function boot(mount: MountState): void {
  const w = embedWindow();
  if (w === null) {
    return;
  }

  /*
   * Was there a `window.Chatly` before us?
   *
   * If so the host page pasted the snippet as well, its loader is already on
   * its way, and injecting a second script tag would fetch the bundle twice.
   * We still queue our own `init`, which the loader prefers over its own —
   * see `apps/widget-loader/src/loader.ts`.
   */
  const preexisting = typeof w.Chatly === 'function';
  const bundleAlreadyLoaded = typeof w.Chatly?.init === 'function';

  const shim: ChatlyGlobalShim =
    w.Chatly ??
    (Object.assign(function queue(this: void, ...args: unknown[]): void {
      (shim.q = shim.q ?? []).push(args);
    }, {}) as ChatlyGlobalShim);
  w.Chatly = shim;

  // The loader reads these off the shim at script-evaluation time. `publicId`
  // in particular: without it the loader refuses to fetch the bundle at all.
  shim.publicId = mount.active.publicId;
  if (mount.active.apiUrl !== undefined) {
    shim.apiUrl = mount.active.apiUrl;
  }
  /*
   * Set BEFORE `injectLoader` below — that ordering IS the feature. The
   * loader reads `lazy` as its own script evaluates, so a write that lands
   * afterwards never happens, silently. The `init` queued just below carries
   * the theme the loader paints its placeholder launcher from, for the same
   * reason.
   */
  if (mount.active.lazy !== undefined) {
    shim.lazy = mount.active.lazy;
  }

  // Subscribe BEFORE init so nothing emitted during boot is missed. `ready`
  // would survive a late subscription (the widget replays the last one) but
  // `open`, `message` and `error` are moments and would not.
  for (const [event, forward] of FORWARDERS) {
    shim('on', event, forward);
  }

  shim('init', initOptionsFor(mount.active));
  if (mount.active.locale !== undefined) {
    shim('setLocale', mount.active.locale);
  }

  if (bundleAlreadyLoaded || preexisting || injectedLoader) {
    return;
  }
  injectLoader(mount.loaderUrl);
}

/** The options the widget's own `init` gets — ours, minus our own extras. */
function initOptionsFor(options: ChatlyEmbedOptions): ChatlyInitOptions {
  // `loaderUrl`, `lazy` and `locale` are this package's, not the widget's.
  // Passing them through would be harmless today and a collision the day the
  // widget adds a key of the same name, so they are stripped rather than
  // ignored. `lazy` would also be the worst of the three to leak: the widget
  // ignores unknown options, so it would look like a setting that works.
  const { loaderUrl: _loaderUrl, lazy: _lazy, locale: _locale, ...init } = options;
  return init;
}

function injectLoader(loaderUrl: string): void {
  injectedLoader = true;
  /*
   * The DOM is the real source of truth, not `injectedLoader`.
   *
   * A dev-server hot reload re-evaluates this module — resetting the flag —
   * while the page keeps the script tag it already appended. Checking the
   * marker attribute means a reload does not stack a second loader (and a
   * second bundle fetch) onto a page that already has one.
   */
  if (document.querySelector('script[data-chatly-loader]') !== null) {
    return;
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = loaderUrl;
  script.setAttribute('data-chatly-loader', '');
  script.onerror = (): void => {
    // The loader has the same message for the bundle it fetches. A script that
    // never loads is otherwise completely silent: an ad blocker, a CSP missing
    // the widget origin, or a typo'd `loaderUrl` all produce an empty page
    // corner and an empty console.
    console.warn(`[Chatly] widget loader failed to load from ${loaderUrl}`);
  };
  document.head.appendChild(script);
}

/** Dispatch through the callable form, which works queued or live. */
function dispatch(method: string, ...args: unknown[]): void {
  const w = embedWindow();
  const chatly = w?.Chatly;
  if (typeof chatly !== 'function') {
    // Not an exception: a header button wired to `open()` on a page where no
    // widget is mounted is a configuration mistake, not a reason to break the
    // host page's click handler.
    console.warn(
      `[Chatly] ${method}() ignored — no widget is mounted. ` +
        'Mount <ChatlyWidget> (or <chatly-widget>) before calling it.',
    );
    return;
  }
  chatly(method, ...args);
}

/**
 * Apply a claim's new props.
 *
 * Three outcomes, and which one you get is the whole contract:
 *
 *   - `visitor` changed → `identify()`. No re-init, no lost panel state.
 *   - `locale` changed → `setLocale()`. Same.
 *   - anything else changed → `init()` again, which DESTROYS and re-mounts.
 *     The conversation is server-side so no history is lost, but an open
 *     panel closes. That is the honest cost of a widget with no `setTheme`,
 *     and it is documented in both READMEs rather than hidden behind a
 *     silently-ignored prop.
 */
function applyUpdate(
  claim: object,
  options: ChatlyEmbedOptions,
  handlers: ChatlyEmbedHandlers,
): void {
  if (state === null) {
    // Updating something that was never started. Start it, so a component
    // whose effect order put the update first still ends up mounted.
    startWidget(claim, options, handlers);
    return;
  }
  state.claims.set(claim, { options, handlers });
  reconcile();
}

/** Bring the live widget in line with the owning claim's options. */
function reconcile(): void {
  if (state === null) {
    return;
  }
  const owner = state.claims.values().next().value;
  if (owner === undefined) {
    return;
  }
  const next = owner.options;
  const active = state.active;

  /*
   * The two options `loader.js` reads once and can never re-read.
   *
   * For `loaderUrl` the bundle is already fetched and `window.Chatly` already
   * installed, so pointing the running widget at another deployment would
   * need a page reload. For `lazy` the question — fetch now or later — was
   * answered before the wrapper got a second chance to ask. Both are refused
   * LOUDLY rather than applied halfway; see `warnLateBootOption`.
   */
  const wantedLoader = next.loaderUrl ?? DEFAULT_LOADER_URL;
  if (wantedLoader !== state.loaderUrl) {
    warnLateBootOption('loaderUrl', state.loaderUrl, wantedLoader);
  }
  if (next.lazy !== state.lazy) {
    warnLateBootOption('lazy', state.lazy, next.lazy);
    state.lazy = next.lazy;
  }

  const initChanged = !sameOptions(initOptionsFor(active), initOptionsFor(next), ['visitor']);
  if (initChanged) {
    state.active = next;
    for (const [event, forward] of FORWARDERS) {
      // `init` destroys and re-mounts. The widget's subscriber registry is
      // module-scoped and survives that, so re-subscribing would double every
      // callback — hence `off` first, with the same function identity, which
      // is why the forwarders are module constants.
      dispatch('off', event, forward);
      dispatch('on', event, forward);
    }
    dispatch('init', initOptionsFor(next));
    if (next.locale !== undefined) {
      dispatch('setLocale', next.locale);
    }
    return;
  }

  if (!sameValue(active.visitor, next.visitor)) {
    state.active = { ...state.active, visitor: next.visitor };
    identifyOrReset(next.visitor);
  }
  if (active.locale !== next.locale) {
    state.active = { ...state.active, locale: next.locale };
    if (next.locale !== undefined) {
      dispatch('setLocale', next.locale);
    }
    // Going from a locale back to `undefined` is left alone deliberately:
    // there is no "unset locale" call, and `setLocale('')` would warn about a
    // missing bundle. The last explicit locale stays in force.
  }
}

/**
 * The visitor prop changed. Sign in, or sign out.
 *
 * A host that renders `visitor={user ?? undefined}` is describing a sign-OUT
 * when it goes away, and `identify(undefined)` is not a thing. `reset()` is:
 * it forgets this visitor and boots a fresh anonymous session, and it drops
 * the identity permanently so the re-boot cannot resurrect the person who
 * just left.
 */
function identifyOrReset(visitor: ChatlyIdentity | undefined): void {
  if (visitor === undefined) {
    dispatch('reset');
    return;
  }
  dispatch('identify', visitor);
}

/**
 * Drop a claim, and tear down when it was the last one.
 *
 * The teardown is a TASK, not a microtask and not immediate. StrictMode's
 * cleanup runs synchronously before the second mount, so a microtask would be
 * enough for it — but an SPA route change that unmounts one layout and mounts
 * another is not guaranteed to be in the same microtask, and treating that as
 * a real teardown is a visible re-boot for the visitor.
 */
function release(claim: object): void {
  if (state === null) {
    return;
  }
  state.claims.delete(claim);
  if (state.claims.size > 0) {
    reconcile();
    return;
  }
  if (state.teardown !== null) {
    return;
  }
  state.teardown = setTimeout(() => {
    if (state === null || state.claims.size > 0) {
      return;
    }
    for (const [event, forward] of FORWARDERS) {
      dispatch('off', event, forward);
    }
    dispatch('destroy');
    state = null;
  }, 0);
}

/**
 * One forwarder per event, created once at module scope.
 *
 * Identity matters twice: `off` only removes a handler it can match, and a
 * re-init re-subscribes. A closure created per boot would leak a subscriber
 * on every mount/unmount cycle and fire every callback N times after N
 * mounts — the kind of bug that only shows up after a few route changes.
 */
const FORWARDERS: ReadonlyArray<[ChatlyEventName, (detail: unknown) => void]> = [
  // The two asserted payloads are the widget's own — `SessionSnapshot` for
  // ready/identified, `{ id, body, authorType }` for message — mirrored in
  // `types.ts` and held there by the parity gate. The rest stay `unknown`
  // because the widget's own types do: re-typing them here would be inventing
  // a contract rather than forwarding one.
  ['ready', (d) => fanOut((h) => h.onReady?.(d as ChatlySession))],
  ['open', () => fanOut((h) => h.onOpen?.())],
  ['close', () => fanOut((h) => h.onClose?.())],
  ['message', (d) => fanOut((h) => h.onMessage?.(d as ChatlyMessageEvent))],
  ['conversation', (d) => fanOut((h) => h.onConversation?.(d))],
  ['identified', (d) => fanOut((h) => h.onIdentified?.(d as ChatlySession))],
  ['reset', (d) => fanOut((h) => h.onReset?.(d))],
  ['action', (d) => fanOut((h) => h.onAction?.(d))],
  ['error', (d) => fanOut((h) => h.onError?.(d))],
];

/**
 * Call one handler on every current claim.
 *
 * Every claim, not just the owner: a page may render the widget in a layout
 * and a `useChatly`-driven badge elsewhere, and both asked to be told. A
 * throwing subscriber must not stop the others, nor reach the widget — which
 * already guards its own dispatch for the same reason.
 */
function fanOut(call: (handlers: ChatlyEmbedHandlers) => void): void {
  if (state === null) {
    return;
  }
  for (const { handlers } of [...state.claims.values()]) {
    try {
      call(handlers);
    } catch (err) {
      console.warn('[Chatly] an event handler threw', err);
    }
  }
}

/**
 * The widget's post-boot methods, typed.
 *
 * This is `ChatlyApi` minus `init`/`destroy` — see the header for why those
 * two are not here — and it invents NOTHING: every method below exists on
 * `window.Chatly`, and `apps/widget/src/public-api.spec.ts` pins which ones do
 * (including a test for the two the widget deliberately does not offer).
 * `scripts/check-widget-wrapper-parity.mjs` fails the build if this object and
 * that interface drift.
 *
 * Every call returns `void`, including the two the widget returns a promise
 * from. The call may be QUEUED — the bundle has not necessarily arrived — and
 * there is nothing to await in that state. `onIdentified` is how you learn
 * that an `identify` landed; `onError` is how you learn it did not.
 */
export const controls = {
  open: (tab?: 'home' | 'messages' | 'help'): void => dispatch('open', tab),
  close: (): void => dispatch('close'),
  toggle: (next?: 'open' | 'close' | boolean): void => dispatch('toggle', next),
  identify: (identity: ChatlyIdentity): void => dispatch('identify', identity),
  setUser: (externalId: string, attributes?: Record<string, unknown>): void =>
    dispatch('setUser', externalId, attributes),
  setCustomAttributes: (attributes: Record<string, unknown>): void =>
    dispatch('setCustomAttributes', attributes),
  deleteCustomAttribute: (key: string): void => dispatch('deleteCustomAttribute', key),
  setLabel: (label: string): void => dispatch('setLabel', label),
  removeLabel: (label: string): void => dispatch('removeLabel', label),
  setLocale: (locale: string): void => dispatch('setLocale', locale),
  track: (name: string, properties?: Record<string, unknown>): void =>
    dispatch('track', name, properties),
  registerPushToken: (
    platform: 'apns' | 'fcm' | 'web-push',
    token: string,
    appVersion?: string,
  ): void => dispatch('registerPushToken', platform, token, appVersion),
  reset: (): void => dispatch('reset'),
  /**
   * Grant or withhold consent to use the visitor's browser storage.
   *
   * The call a consent banner makes. Withholding purges what is already
   * stored; granting allows writes from that moment on and replays nothing.
   * See the `storage` embed option.
   */
  setStorageConsent: (granted: boolean): void => dispatch('setStorageConsent', granted),
  /**
   * Open the panel ON a conversation, optionally routed and pre-filled.
   *
   * `botSlug` is published by the widget as the unsigned context claim
   * `context.unverified.bot`, which an operator keys a bot route on — there
   * is no "start with bot X" endpoint. A visitor can therefore forge it,
   * which is fine for "ask the shopping agent rather than support" and not
   * fine if the two assistants differ in what they may reach.
   */
  startConversation: (request?: { botSlug?: string; initialMessage?: string }): void =>
    dispatch('startConversation', request),
  /**
   * Tell the widget what this page claims about the visitor.
   *
   * `audience` is UNSIGNED — it lands in `context.unverified.audience` and
   * the visitor can set it themselves, because the widget is on their page.
   * `contextToken` is a JWT your SERVER signs with the channel's
   * identity-verification secret, and only its claims reach
   * `context.verified.*`, which is the bag a privilege decision may rest on.
   */
  setContext: (input: {
    audience?: string;
    context?: Record<string, string | number | boolean>;
    page?: { path?: string; url?: string };
    contextToken?: string;
  }): void => dispatch('setContext', input),
  /**
   * Report what your page did with a `host_event`, back into the thread.
   *
   * Pass back the `messageId` and `actionId` the `action` event handed you.
   * Reporting the same action twice replaces the first result rather than
   * stacking, so your own retry logic leaves one line.
   */
  reportAction: (input: {
    messageId: string;
    actionId: string;
    status: 'done' | 'failed';
    text?: string;
    blocks?: unknown;
    data?: Record<string, unknown>;
  }): void => dispatch('reportAction', input),
} as const;

/**
 * Subscribe to one widget event, and get the unsubscribe back.
 *
 * Not on `controls`, because `controls` mirrors the methods you can call and
 * this is a pair you must not get wrong: `Chatly.off` only removes a handler
 * it can match by identity, so a consumer who built a fresh closure for `on`
 * and another for `off` leaks a subscriber on every mount. Handing back the
 * exact unsubscribe removes the chance.
 *
 * Survives a re-init: the widget's subscriber registry is module-scoped and
 * `init()` does not clear it.
 */
export function subscribe(event: ChatlyEventName, handler: (detail: unknown) => void): () => void {
  dispatch('on', event, handler);
  let off = false;
  return () => {
    if (off) {
      return;
    }
    off = true;
    dispatch('off', event, handler);
  };
}

/** Test-only window into the module's state. Not part of the public surface. */
export const __testing = {
  reset(): void {
    if (state !== null && state.teardown !== null) {
      clearTimeout(state.teardown);
    }
    state = null;
    injectedLoader = false;
    resetConflictWarning();
  },
  claimCount(): number {
    return state?.claims.size ?? 0;
  },
  isMounted(): boolean {
    return state !== null;
  },
};

/**
 * Re-exported because it was part of this module's surface before the split
 * and `same-value.spec.ts` imports it from here.
 */
export { sameValue } from './same-value.js';
