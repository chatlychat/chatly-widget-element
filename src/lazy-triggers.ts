/**
 * Lazy mode — do not fetch `widget.js` until something wants it.
 *
 * ── The problem ─────────────────────────────────────────────────────────
 *
 * The loader injects `widget.js` on page load, so every visitor on every page
 * view downloads ~44KB gzipped (the first-paint budget in CLAUDE.md §2)
 * whether or not they ever open the chat. On a marketing site most of them
 * never do.
 *
 * ── Why this module is in `@chatlychat/widget-element` ──────────────────
 *
 * It was `apps/widget-loader/src/lazy.ts`, and that shipped the decision
 * about whether to contact Chatly FROM Chatly: every mode — `'manual'`
 * included, which promises in writing that nothing loads until the host calls
 * `load()` — still fetched `loader.js` on page load, so our CDN logged the
 * visitor's IP, user agent and referrer before they touched anything.
 * `storage: 'deny'` did not change it, because that setting governs the
 * device and not the network. Moving the triggers into the package the SITE
 * bundles is what makes "no request to any Chatly host until the visitor
 * reaches for the chat" true rather than nearly true. `apps/widget-loader`
 * imports every symbol here and bundles the same code, so a pasted snippet
 * behaves exactly as before — it simply cannot be private before its own
 * first request, and now says so. Nothing here may read
 * `document.currentScript` or any other loader-execution-time global: in the
 * npm path this module is evaluated when the host's bundle is parsed, which
 * is why `drawPlaceholder` takes its nonce as an argument.
 *
 * ── The failure mode that decides the design ────────────────────────────
 *
 * A visitor clicks a launcher that is not there yet. Any lazy scheme that
 * shows NOTHING until the bundle lands is a regression, not an optimisation:
 * the page has no chat affordance and the visitor who wanted help cannot ask.
 * So lazy mode draws a PLACEHOLDER launcher (`placeholder.ts`) mirroring the
 * real one's geometry and colours, and a click on it goes onto the SAME queue
 * the snippet has always used — no second queue and no second replay path, so
 * the panel opens the moment the bundle drains the one array there is.
 *
 * ── Triggers, and the one that was deliberately rejected ────────────────
 *
 * Default (`lazy: true`, spelled `'launcher'`):
 *
 *   1. the placeholder launcher hovered or focused — a PREFETCH, so the click
 *      ~200ms later finds the bundle already in cache;
 *   2. the placeholder launcher being clicked or keyed (it is a real
 *      `<button>`, so Enter and Space come free) — fetch, and queue `open`;
 *   3. any queued call that needs the UI up: `load`, `open`, `toggle`,
 *      `show`, `boot`, `startConversation`. A host page with its own "Chat
 *      with us" button in the header wired to `Chatly.open()` must work in
 *      lazy mode, and that button may be clicked before anything else;
 *   4. for an INLINE embed (`mountTo`), the container approaching the
 *      viewport — there is no launcher to stand in for.
 *
 * `lazy: 'interaction'` adds the first real interaction with the page
 * (pointer, key, touch, scroll). NOT the default: nearly every visitor
 * scrolls, so it buys almost nothing over eager and adds a race.
 *
 * `lazy: 'manual'` draws no placeholder and waits for `Chatly('load')`. For a
 * host that renders its own launcher AND wants the decision to stay entirely
 * its own — including for a returning chatter, whom this mode alone does not
 * fetch for.
 *
 * `<ChatlyLauncher>` is NOT an example of `'manual'` (NCH-18): it asks for
 * `'launcher'` with `theme.hideLauncher`, so it draws no placeholder but does
 * still get the returning-chatter fetch below. A wrapper default cannot keep
 * `'manual'`'s promise, because the host never made it.
 *
 * **`requestIdleCallback` plus a timeout was rejected outright.** It converts
 * a byte SAVING into a byte DELAY: the visitor who never opens the chat still
 * pays the 44KB, just later, competing with the host page's own idle work.
 *
 * ── Deliberately not inferred ───────────────────────────────────────────
 *
 * Lazy mode is never turned on by us. `prefers-reduced-data` and
 * `navigator.connection.saveData` only make an already-lazy embed lazier
 * (they suppress the `'interaction'` pre-warm, see `savesData`), never switch
 * an eager embed over: an embed that behaves differently on a metered
 * connection than the customer configured is an unreproducible ticket.
 */

import {
  hasStoredThread,
  methodOf,
  normalizeLazy,
  queuedInitOptions,
  type LazyMode,
  type LoaderShim,
} from './lazy-shim-reads.js';
import { drawPlaceholder, placeholderTheme, type PlaceholderTheme } from './placeholder.js';

/*
 * Re-exported so `@chatlychat/widget-element/lazy-triggers` stays the single
 * specifier both callers import — `apps/widget-loader/src/{loader,consent}.ts`
 * and `defer-loader.ts` in this package. A file split made at the line ceiling
 * should not turn into a second entry point.
 */
export {
  hasStoredThread,
  methodOf,
  normalizeLazy,
  queuedInitOptions,
  type LazyMode,
  type LoaderShim,
};

/**
 * Queued calls that mean "the visitor wants the chat, now".
 *
 * Everything else — `init`, `on`, `identify`, `setUser`, `setContext` — is
 * configuration or bookkeeping whose effect the queue already preserves, so
 * it must NOT pull 44KB down. The one honest cost of that choice is
 * `track()`: an event fired in lazy mode sits in the queue until something
 * loads the bundle, and a visitor who leaves the page first loses it. The
 * eager default is unaffected, and this is documented in both READMEs.
 */
const WANTS_UI = new Set(['load', 'open', 'toggle', 'show', 'boot', 'startConversation']);

/** Only the init options lazy mode has to understand. */
interface LazyRelevantOptions {
  theme: PlaceholderTheme;
  hideLauncher: boolean;
  mountTo: string | Element | undefined;
  hideOnUrls: string[];
  /** W-07: needed to look up this channel's stored thread. */
  publicId: string | undefined;
}

/**
 * What the widget will be initialised with, as far as lazy mode can know it.
 *
 * Read from the shim's own properties plus a QUEUED `init`, merged in the
 * same precedence `loader.ts` uses when it replays (the queued options win,
 * the shim is the fallback).
 *
 * That the queued `init` is already present when this runs is not luck. The
 * classic snippet is synchronous inline script and the loader tag is `async`,
 * so every `Chatly('init', …)` on the page has run before this file is
 * evaluated; and `@chatlychat/widget-element` queues its `init` before it
 * appends the loader script. An `init` queued LATER still configures the
 * widget correctly — it is replayed either way — it just cannot retint a
 * placeholder that is already painted.
 */
function lazyRelevantOptions(shim: LoaderShim): LazyRelevantOptions {
  const supplied = queuedInitOptions(shim);
  /*
   * A COPY, and every queued `setTheme` folded over it.
   *
   * ── Why the placeholder has to look at `setTheme` at all ───────────────
   *
   * `Chatly('setTheme', …)` is deliberately NOT in `WANTS_UI`: it is
   * configuration, and configuration must not pull 44KB down. So in lazy mode
   * a host that sets its theme before load gets its call replayed after
   * `init` — correct for the real launcher, and invisible to the placeholder,
   * which paints from the queued `init` and nothing else. A page whose brand
   * colour is chosen at runtime drew a Chatly-blue circle until the bundle
   * arrived and then changed colour under the visitor.
   *
   * It is narrower than it sounds and the honest scope is worth writing down:
   * `placeholderTheme` reads `primaryColor`, `primaryContrast`,
   * `launcherSize`, `position`, `offsetX`, `offsetY` and `launcherImage`. A
   * `setTheme({ colorScheme: 'dark' })` changes NONE of those — the
   * placeholder is a brand-coloured circle with no scheme of its own — so
   * this fixes the brand colour, the ink, the size, the corner and the image,
   * not dark mode.
   *
   * ── The copy is load-bearing ──────────────────────────────────────────
   *
   * `supplied['theme']` is the object inside the QUEUED `init`, which
   * `loader.ts` replays verbatim. Folding the patches into it in place would
   * rewrite the host's own init options, so the widget would receive them as
   * the SNIPPET layer rather than as the live override — a different
   * precedence, and one the host never asked for.
   */
  const theme = { ...((supplied['theme'] ?? {}) as Record<string, unknown>) };
  for (const entry of shim.q ?? []) {
    if (methodOf(entry) === 'setTheme') {
      const patch = (entry as ArrayLike<unknown>)[1];
      if (typeof patch === 'object' && patch !== null) {
        Object.assign(theme, patch);
      }
    }
  }
  const behavior = (supplied['behavior'] ?? {}) as Record<string, unknown>;
  const mountTo = supplied['mountTo'];
  const hideOnUrls = behavior['hideOnUrls'];

  return {
    theme: placeholderTheme(theme),
    hideLauncher: theme['hideLauncher'] === true,
    mountTo:
      typeof mountTo === 'string' || mountTo instanceof Element
        ? mountTo
        : (shim.mountTo ?? undefined),
    hideOnUrls: Array.isArray(hideOnUrls) ? hideOnUrls.filter((g) => typeof g === 'string') : [],
    publicId:
      typeof supplied['publicId'] === 'string'
        ? supplied['publicId']
        : (shim.publicId ?? undefined),
  };
}

/**
 * The widget's own `hideOnUrls` check, mirrored.
 *
 * `init()` returns before mounting anything when `location.pathname` matches
 * one of these globs, so on such a page an eager embed shows no launcher at
 * all. A placeholder there would be a launcher the customer switched OFF,
 * appearing only in lazy mode — and clicking it would fetch 44KB to be
 * refused. So lazy mode makes the same decision the widget would, which also
 * means a hidden page now costs ZERO bytes instead of 44KB.
 *
 * Mirrored from `matchGlob` in `apps/widget/src/index.ts`, character for
 * character, for the reason given on `placeholderTheme`.
 */
function hiddenOnThisUrl(globs: readonly string[], pathname: string): boolean {
  return globs.some((pattern) => {
    const re = new RegExp(
      '^' +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$',
    );
    return re.test(pathname);
  });
}

/**
 * Does this visitor want us to move fewer bytes?
 *
 * Both signals, because they come from different places: the media query is a
 * stated user preference, `saveData` is the browser's own data-saver mode.
 * Either one suppresses the `'interaction'` pre-warm, so the bundle is
 * fetched only when the visitor actually reaches for the chat.
 */
function savesData(): boolean {
  // `window.navigator`, not the bare global. Node 20 has a `navigator` of its
  // own, so under vitest's jsdom the bare identifier can resolve to the
  // runtime's object rather than the document's — which made the data-saver
  // branch untestable and would have made it unreachable in any embedding
  // that does the same.
  const connection = (window.navigator as { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData === true) {
    return true;
  }
  try {
    return window.matchMedia('(prefers-reduced-data: reduce)').matches;
  } catch {
    // `matchMedia` is absent in some embedded webviews, and an unknown media
    // feature throws in a few older ones. Neither is a reason to stop.
    return false;
  }
}

export interface LazyArming {
  shim: LoaderShim;
  /** Fetch and run the bundle. Must be idempotent. */
  load: (reason: string) => void;
  /**
   * The CSP nonce for the stand-in launcher's `<style>`, or undefined. An
   * argument because the callers learn it at different moments — see the note
   * on `drawPlaceholder`.
   */
  nonce?: string;
}

/**
 * Arm the triggers for `mode` and return the teardown.
 *
 * The teardown is called by `loader.ts` once the bundle has been replayed:
 * it removes the placeholder (the real launcher is on screen by then — the
 * widget's `init` renders synchronously) and unhooks every listener and the
 * patched queue.
 */
export function armLazyLoad(mode: Exclude<LazyMode, 'off'>, arm: LazyArming): () => void {
  const options = lazyRelevantOptions(arm.shim);
  const teardowns: Array<() => void> = [];

  /*
   * The queue watch is armed in EVERY lazy mode, including `manual`, and it
   * is the one trigger that cannot be skipped: it is what makes
   * `Chatly('load')`, a host page's own `Chatly.open()` button and
   * `<ChatlyLauncher>` work. It is also armed on a `hideOnUrls` page, so an
   * explicit `open()` still loads the bundle and still gets the widget's own
   * refusal — the same outcome as an eager embed.
   */
  teardowns.push(watchQueue(arm.shim, (method) => arm.load(`queued ${method}()`)));

  if (hiddenOnThisUrl(options.hideOnUrls, window.location.pathname)) {
    return () => {
      for (const off of teardowns) {
        off();
      }
    };
  }

  /*
   * W-07. A returning chatter gets their thread back without clicking.
   *
   * Lazy mode used to treat everyone as a first-time visitor: someone who
   * asked a question yesterday, got an answer overnight and came back saw a
   * placeholder launcher with no badge and no thread, and had to click and
   * wait for 44KB before learning they had a reply. The unread count (W-06)
   * cannot be drawn by the placeholder — counting needs the bundle — so in
   * lazy mode the reply was effectively invisible.
   *
   * Three deliberate boundaries:
   *
   *   - AFTER the `hideOnUrls` return above: a conversation is not a reason
   *     to override the customer's own switch for this page.
   *   - NOT in `manual`, which means "load nothing until I call `load()`" —
   *     an explicit instruction a stored thread is no grounds to disobey.
   *   - NOT suppressed by `savesData()`, unlike the `'interaction'` pre-warm
   *     below. That one is speculative; this visitor has a conversation in
   *     progress and possibly an answer waiting in it, so the fetch is
   *     already something they asked for. Data-saver should make an embed
   *     lazier about guessing, not hide a reply.
   *
   * The placeholder is still armed below, on purpose: it paints instantly
   * while the bundle is in flight, so a returning visitor on a slow
   * connection sees a launcher rather than an empty corner, and the real one
   * replaces it on replay.
   */
  if (mode !== 'manual' && hasStoredThread(options.publicId)) {
    arm.load('returning visitor with a stored thread');
  }

  if (mode === 'interaction' && !savesData()) {
    teardowns.push(onFirstInteraction(() => arm.load('first page interaction')));
  }

  if (options.mountTo !== undefined) {
    // Inline: no launcher exists in either mode, so the container is the
    // trigger. `manual` opts out of that too.
    if (mode !== 'manual') {
      teardowns.push(onContainerNearViewport(options.mountTo, arm.load));
    }
  } else if (mode !== 'manual' && !options.hideLauncher) {
    teardowns.push(
      drawPlaceholder(
        options.theme,
        {
          prefetch: () => arm.load('placeholder hover'),
          activate: () => {
            arm.load('placeholder click');
            /*
             * Through the global, not a private queue. Before the bundle
             * lands this is the shim and the call is queued where
             * `loader.ts` will replay it; after it lands it is the real API
             * and the panel opens at once. One path, both states — which is
             * the whole reason the placeholder reuses the existing queue
             * instead of inventing a "pending open" flag the replay would
             * have to know about.
             */
            // Cast locally: the `declare global` for `window.Chatly` lives
            // in `loader.ts`, and this module is also compiled as part of a
            // published package that declares no globals of its own.
            (window as unknown as { Chatly?: (...a: unknown[]) => void }).Chatly?.('open');
          },
        },
        arm.nonce,
      ),
    );
  }

  return () => {
    for (const off of teardowns) {
      off();
    }
  };
}

/**
 * See every call that lands in the queue, without replacing the global.
 *
 * `window.Chatly` is deliberately left alone. Replacing the function would
 * orphan any reference a host page captured (`const chat = window.Chatly`)
 * and would mean two objects claiming to be the shim — and the queue array
 * being shared between holders has already produced one replay bug here (see
 * the drain comment in `loader.ts`). Patching `push` on the array the snippet
 * writes to is the smaller intervention: both snippet forms and both wrappers
 * push to `window.Chatly.q`, so this sees all of them.
 *
 * `delete` restores the prototype's `push` rather than assigning a copy of
 * it, so the array is left exactly as it was found.
 */
function watchQueue(shim: LoaderShim, onWanted: (method: string) => void): () => void {
  const queue = (shim.q = shim.q ?? []);
  const patched = function (this: unknown[], ...items: unknown[]): number {
    const length = Array.prototype.push.apply(this, items);
    for (const item of items) {
      const method = methodOf(item);
      if (method !== null && WANTS_UI.has(method)) {
        onWanted(method);
      }
    }
    return length;
  };
  Object.defineProperty(queue, 'push', {
    value: patched,
    configurable: true,
    writable: true,
    enumerable: false,
  });

  // Anything already queued before we got here — a `Chatly('open')` in inline
  // script above the loader tag — has to count too.
  for (const item of queue) {
    const method = methodOf(item);
    if (method !== null && WANTS_UI.has(method)) {
      onWanted(method);
    }
  }

  return () => {
    delete (queue as { push?: unknown }).push;
  };
}

/** The first pointer, key, touch or scroll anywhere on the page. */
function onFirstInteraction(fire: () => void): () => void {
  const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
  const handler = (): void => {
    off();
    fire();
  };
  const off = (): void => {
    for (const event of events) {
      window.removeEventListener(event, handler, true);
    }
  };
  for (const event of events) {
    // Passive and capturing: we must never delay or swallow the host page's
    // own handling of the gesture that happens to be the trigger.
    window.addEventListener(event, handler, { capture: true, passive: true });
  }
  return off;
}

/**
 * An inline embed's container approaching the viewport.
 *
 * `rootMargin` starts the fetch before the box is visible, so a visitor
 * scrolling towards it meets a chat rather than a hole.
 *
 * Both failure paths load IMMEDIATELY rather than waiting, and that is the
 * important part: a `mountTo` selector that matches nothing is a
 * misconfiguration the widget reports loudly ("not mounted — mountTo selector
 * matched nothing"), and a lazy mode that never loaded would replace that
 * message with silence.
 */
function onContainerNearViewport(
  mountTo: string | Element,
  load: (reason: string) => void,
): () => void {
  const container = typeof mountTo === 'string' ? document.querySelector(mountTo) : mountTo;
  if (container === null) {
    load('mountTo matched nothing — loading so the widget can report it');
    return () => undefined;
  }
  if (typeof IntersectionObserver === 'undefined') {
    load('no IntersectionObserver');
    return () => undefined;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load('mount container near the viewport');
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(container);
  return () => observer.disconnect();
}
