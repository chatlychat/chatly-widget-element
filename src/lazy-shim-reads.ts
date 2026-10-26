/**
 * What can be learned from the loader shim before the bundle exists.
 *
 * Split out of `lazy-triggers.ts` at this repo's 650-line ceiling
 * (`scripts/check-file-size.mjs`), and it is the honest seam: everything here
 * READS — the shape of the global, the queued `init`, whatever the customer
 * wrote in `lazy`, whether this browser already holds a thread — and nothing
 * here decides anything or touches the DOM. `lazy-triggers.ts` keeps the
 * deciding.
 *
 * Re-exported from `lazy-triggers.ts`, so both callers keep the one import
 * specifier (`@chatlychat/widget-element/lazy-triggers`) and the split is
 * invisible outside this directory.
 *
 * The same constraint applies as to its sibling: nothing here may read
 * `document.currentScript` or any other loader-execution-time global, because
 * in the npm path this module is evaluated when the host's bundle is parsed.
 */

/**
 * The shape the snippet builds and both callers read.
 *
 * Declared once here rather than in each: the `declare global` for
 * `window.Chatly` lives in `loader.ts`, but every field on it is read here
 * too, and two copies is the drift `check-widget-wrapper-parity.mjs` exists
 * for one layer up.
 */
export interface LoaderShim {
  (...args: unknown[]): void;
  q?: unknown[];
  publicId?: string;
  apiUrl?: string;
  bundleUrl?: string;
  /**
   * Has this browser chatted on this channel before? (Numera NCH-12.)
   *
   * Defined on the STUB, before `widget.js` exists, which is the whole point:
   * `Chatly.hasSession` was `undefined` until the bundle loaded, so a host in
   * `lazy: 'manual'` — the mode that loads nothing until it is told to — had
   * no way to ask the question its own decision depends on. It can now write
   * `if (Chatly.hasSession()) Chatly('load')`.
   *
   * Reads the SAME `chatly:vr:<publicId>` key `hasStoredThread` and the
   * bundle's own `hasSession()` read, so the stub and the loaded widget
   * cannot disagree about who is a returning visitor.
   *
   * WHO assigns it depends on how the widget got on the page, and that used
   * to be a caveat: `loader.js` did, as it evaluated, and its tag is `async`
   * — so code in the same tick as the snippet, or in a React effect in the
   * same commit as the mount, asked before there was anything to ask and got
   * `undefined`. For a plain snippet that is still the case: read it from the
   * loader tag's own `onload`. Mounted through this package, `startWidget`
   * installs it synchronously (`armLoaderFetch` in `defer-loader.ts`), from
   * the same `hasStoredThread`, so a mount effect can ask.
   *
   * `manual` deliberately does NOT auto-load for a returning visitor, which
   * is what NCH-12 asked for and is declined on purpose: `manual` means "load
   * nothing until I call `load()`", and overriding that would break the one
   * promise the mode makes. Handing the host this predicate is the honest
   * answer — the decision stays theirs, and it is now possible to make.
   *
   * NCH-18 reported the same invisible reply through
   * `<ChatlyLauncher publicId>`, which had no host to make the decision: it
   * was a WRAPPER choosing `manual` on the host's behalf. That was fixed by
   * moving its default to `'launcher'`, not by weakening this mode.
   */
  hasSession?: () => boolean;
  /**
   * Mount the widget inside this element instead of floating it over the
   * page. A selector, since the snippet is plain script in a <head> and has
   * no element to hand.
   */
  mountTo?: string;
  /**
   * Opt into lazy mode. `unknown` because this is a value a customer types
   * into a `<script>` tag or an HTML attribute — see `normalizeLazy`, which
   * is the only thing that may interpret it.
   */
  lazy?: unknown;
  /**
   * The CSP nonce to stamp on every `<script>` and `<style>` this widget
   * creates, for a page whose policy has no `'unsafe-inline'` (B-04).
   *
   * On the SHIM and deliberately not on `InitOptions`: the loader appends
   * `widget.js` before any queued `init` is drained, so a nonce arriving
   * through `init` would come too late for the one tag that matters most.
   * `check-widget-wrapper-parity` compares `InitOptions` against
   * `ChatlyInitOptions` in both directions and would fail on a one-sided
   * addition anyway.
   *
   * A nonce only ever applies to `<script>`, `<style>` and `<link>`
   * ELEMENTS. It cannot be carried by a style ATTRIBUTE, so the widget's
   * `style.cssText` writes are untouched by this and are not a `style-src`
   * exposure either.
   */
  nonce?: string;
}

/** The modes, after normalisation. `'off'` is what every existing embed gets. */
export type LazyMode = 'off' | 'launcher' | 'interaction' | 'manual';

/**
 * The method name of a queued entry, or null.
 *
 * Queued entries are NOT all arrays. The snippet every customer pastes pushes
 * `arguments` — an array-like object, where `Array.isArray` is false — while
 * `@chatlychat/widget-element` pushes a real array. Anything that inspects
 * the queue has to handle both, and `loader.ts` did not: see the comment on
 * the `init` lookup there.
 */
export function methodOf(entry: unknown): string | null {
  if (entry === null || typeof entry !== 'object') {
    return null;
  }
  const first = (entry as ArrayLike<unknown>)[0];
  return typeof first === 'string' ? first : null;
}

/**
 * The options object of the first queued `init`, or `{}`.
 *
 * Shared by the placeholder (`lazyRelevantOptions`) and the consent reader
 * (`consent.ts`), both of which must read the embed's options before the
 * bundle exists — one copy, because every byte here is on every page view.
 */
export function queuedInitOptions(shim: LoaderShim): Record<string, unknown> {
  const queued = (shim.q ?? []).find((entry) => methodOf(entry) === 'init');
  return (queued === undefined ? {} : ((queued as ArrayLike<unknown>)[1] ?? {})) as Record<
    string,
    unknown
  >;
}

/**
 * Interpret whatever the customer wrote.
 *
 * `''` is `'launcher'`, which looks wrong in JavaScript and is right in HTML:
 * `<chatly-widget lazy>` gives `getAttribute('lazy') === ''`, and a bare
 * attribute means "on" everywhere else in the platform. Nobody writes
 * `Chatly.lazy = ''` on purpose.
 *
 * An unrecognised value falls back to `'off'` — today's behaviour, which is
 * the safe direction — but WARNS. A typo'd mode that silently disabled lazy
 * loading would look exactly like a mode that does not work.
 */
export function normalizeLazy(raw: unknown): LazyMode {
  if (raw === undefined || raw === null || raw === false) {
    return 'off';
  }
  if (raw === true) {
    return 'launcher';
  }
  if (typeof raw !== 'string') {
    warnMode(raw);
    return 'off';
  }
  const value = raw.trim().toLowerCase();
  if (value === 'false' || value === 'off' || value === '0') {
    return 'off';
  }
  if (value === '' || value === 'true' || value === '1' || value === 'launcher') {
    return 'launcher';
  }
  if (value === 'interaction' || value === 'manual') {
    return value;
  }
  warnMode(raw);
  return 'off';
}

function warnMode(raw: unknown): void {
  console.warn(
    `[Chatly] ignored lazy=${JSON.stringify(raw)} — the widget loads eagerly, as if lazy ` +
      'were unset. Accepted values: true, false, "launcher", "interaction", "manual".',
  );
}

/**
 * W-07. Does this browser already hold a conversation on this channel?
 *
 * ── Why the unread watermark is the right key ─────────────────────────────
 *
 * `chatly:vr:<publicId>` maps conversation id → the last timestamp this
 * visitor has seen, and `widget/unread.ts` writes it only once a thread
 * exists. So its mere existence answers "has this person chatted here
 * before" without the loader having to understand its contents, and
 * `Chatly('hasSession')` in `apps/widget/src/index.ts` tests the SAME key —
 * the two cannot disagree about who is a returning visitor.
 *
 * The visitor token would have been the obvious choice and is the wrong one:
 * it is minted by `init` for every visitor who loads the widget at all, so
 * it would call a first-time visitor who bounced a returning chatter and
 * make lazy mode eager for everyone, permanently.
 *
 * ── Read through a guard, always ──────────────────────────────────────────
 *
 * Touching `localStorage` THROWS — not returns null — when site data is
 * blocked or the document is on an opaque origin (a sandboxed iframe). The
 * widget bundle has `safeStorage` for this; the loader is a standalone 2KB
 * artifact that must not import the bundle it exists to defer, so it carries
 * its own guard. Unguarded reads of this exact API have stopped the widget
 * booting here before.
 */
export function hasStoredThread(publicId: string | undefined): boolean {
  if (publicId === undefined) {
    return false;
  }
  try {
    // `sessionStorage` first: under `consent: 'auto'` with `support_chat`
    // not granted, the watermark lives there for the visit (ADR 0071) — the
    // same order the bundle's own read takes in `safe-storage.ts`.
    const key = `chatly:vr:${publicId}`;
    return (sessionStorage.getItem(key) ?? localStorage.getItem(key)) !== null;
  } catch {
    return false;
  }
}
