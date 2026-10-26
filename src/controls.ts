/**
 * `controls` — the widget's post-boot methods, as a host calls them.
 *
 * Split out of `embed.ts` at the 650-line ceiling. The seam: `embed.ts` owns
 * the MOUNT (claims, reference counting, boot, reconcile, teardown), and this
 * file owns the imperative surface a host reaches for afterwards. Nothing in
 * `embed.ts` reads `controls`, so the edge is one-way and there is no cycle.
 *
 * `scripts/check-widget-wrapper-parity.mjs` reads this object by path and
 * compares it against the widget's `ChatlyApi` in both directions — it was
 * repointed here in the same commit as the move, and its coverage floor
 * would have failed loudly if it had not been.
 */
import { dispatch, read } from './embed.js';

import type { ChatlyIdentity, ChatlyOpenRequest, ChatlyTheme } from './types.js';

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
  /*
   * The object form is passed straight through rather than being re-typed
   * here. This read `(tab?: 'home' | 'messages' | 'help')` while the widget
   * had accepted `{ view: 'conversation', … }` for weeks: an element consumer
   * could not open a thread at all, and `check-widget-wrapper-parity.mjs` did
   * not see it because it compares the method NAMES.
   */
  open: (target?: 'home' | 'messages' | 'help' | ChatlyOpenRequest): void =>
    dispatch('open', target),
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
  dismiss: (conversationId: string): void => dispatch('dismiss', conversationId),
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
   * Report a consent decision per category: `true` granted, `false` refused,
   * `null` undecided, omitted unchanged. See the `consent` embed option.
   */
  setConsent: (decision: {
    functional?: boolean | null;
    analytics?: boolean | null;
    marketing?: boolean | null;
  }): void => dispatch('setConsent', decision),
  /**
   * Move the widget and its panel after boot (NCH-22).
   *
   * `x`/`y` move the launcher's corner offsets; `panelY` moves the panel's
   * bottom edge up from them — what a page drawing its OWN launcher button
   * needs, since `hideLauncher` otherwise lands the panel on top of it. The
   * declarative spelling is `theme.panelOffsetY`.
   *
   * On `controls` and not exempted from the parity gate, unlike `mount`: this
   * touches nothing the reference count in `embed.ts` owns. It moves two
   * inline properties on an element that is already mounted, closes nothing,
   * and emits no lifecycle event — so a second `<ChatlyWidget>` consumer
   * calling it cannot desynchronise the first one's view of the mount.
   */
  setOffset: (offset: { x?: number; y?: number; panelY?: number }): void =>
    dispatch('setOffset', offset),
  /**
   * Re-theme the widget live, without tearing it down (CHT-S-09).
   *
   * Each call merges, like `setOffset`, and layers above the `theme` prop and
   * the branding configured on the channel. It repaints an open panel in
   * place, issues no network request and emits no lifecycle event.
   *
   * ── This is the LIVE path, and the `theme` prop is not ──────────────────
   *
   * Changing the `theme` attribute or property re-boots the widget:
   * `reconcile()` in `embed.ts` treats any change to an `init` option as an
   * `init`, which destroys and re-mounts. That is right for most options and
   * wrong for this one, and routing a changed `theme` prop through here
   * instead is NOT a wiring fix — a prop describes a whole theme, so a key
   * the host REMOVED would have to be un-layered, and this method's merge
   * semantics cannot express that while the stale prop still sits
   * underneath. It needs a decision; until then, a host with a light/dark
   * switch calls this and leaves the prop alone.
   *
   * On `controls` rather than exempted from the parity gate, for the same
   * reason as `setOffset`: it touches nothing the reference count in
   * `embed.ts` owns, closes nothing, and cannot desynchronise a second
   * consumer's view of the mount.
   */
  setTheme: (theme: ChatlyTheme): void => dispatch('setTheme', theme),
  /**
   * Unread replies waiting for this visitor, across their threads (W-06).
   *
   * `0` when no widget is mounted yet, which is the ordinary case for a badge
   * that renders on first paint. Pair it with the `unread` event rather than
   * polling: the event fires whenever the total changes, including the first
   * time it is known.
   */
  getUnreadCount: (): number => read('getUnreadCount', 0),
  /**
   * Whether this browser already holds a conversation on this channel (W-07).
   *
   * What lazy mode tests before deciding to load eagerly, exposed so a host
   * page can make the same decision — showing "continue your conversation"
   * rather than "chat with us", say.
   *
   * **Answerable immediately since 0.20.0**, and this comment used to say the
   * opposite. It read "`false` until `loader.js` has evaluated", which was
   * true while the loader was the thing that defined `Chatly.hasSession` on
   * the shim: the script is injected `async`, so an effect in the same commit
   * as the mount asked a question nothing could answer and got the fallback.
   *
   * `startWidget` installs it now (`defer-loader.ts`), synchronously, from
   * the same `hasStoredThread` the loader used — it had to, because deferring
   * the loader means a host in `lazy: 'manual'` would otherwise call
   * `Chatly.hasSession()` and get `undefined is not a function`, which is the
   * exact question that mode exists to answer. The bundle still replaces it
   * with its own read of the same `chatly:vr:<publicId>` key on arrival, so
   * all three implementations agree.
   *
   * `<ChatlyLauncher>` still preloads for a returning chatter by choosing a
   * `lazy` MODE rather than by calling this and `load()`, and that remains
   * the better shape: the mode is one decision the package acts on itself,
   * where this is two calls a host has to sequence.
   */
  hasSession: (): boolean => read('hasSession', false),
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
