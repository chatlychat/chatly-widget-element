/**
 * The widget's init options, as a dependency-free type.
 *
 * ── Why these are declared again here ───────────────────────────────────
 *
 * The authoritative declaration is `InitOptions` in
 * `packages/sdk-js/src/widget-globals.ts` — it moved there out of
 * `apps/widget` so a snippet integrator could install it. This package still
 * cannot IMPORT it: `@chatlychat/widget-element` ships to a customer's
 * bundler with ZERO dependencies, and taking one on `@chatlychat/sdk-js`
 * purely to reach a type would put a second browser SDK in the install graph
 * of every Vue, Svelte and React consumer. A dependency-free copy under a
 * gate is the cheaper of the two.
 *
 * Two copies of a shape is a drift risk, so it is a CHECKED one:
 * `scripts/check-widget-wrapper-parity.mjs` compares the key sets in this file
 * against the widget's own interfaces and fails the build when either side
 * gains a key the other does not have. Without that gate the failure is
 * silent and one-directional — the widget adds `theme.somethingNew`, a React
 * consumer passes it, and TypeScript rejects a value the widget would have
 * honoured.
 *
 * Nothing here is validated at runtime, and that is deliberate (see
 * `coerceConfig` in `embed.ts` for the one place a boundary exists).
 */

/**
 * The object form of `open`. Mirrors the widget's `OpenRequest`.
 *
 * Mirrored rather than imported because this package has NO dependencies —
 * that is its whole point, and `check-widget-wrapper-parity.mjs` is what
 * stops a mirror drifting from the thing it mirrors.
 *
 * `conversationId` opens an EXISTING thread. It is not a capability: the id
 * sits on a page the visitor controls, and every widget read of a thread is
 * checked against the visitor session server-side, so a forged one opens an
 * empty panel.
 */
export interface ChatlyOpenRequest {
  readonly view: 'conversation';
  readonly botSlug?: string;
  readonly initialMessage?: string;
  readonly conversationId?: string;
}

/** Identity the host page already knows. Mirrors the widget's `WidgetIdentity`. */
export interface ChatlyIdentity {
  /**
   * Your own stable id for this person. Optional in the type, but it is the
   * only field contacts are matched on — without it every visit creates a new
   * contact.
   */
  externalId?: string;
  email?: string;
  name?: string;
  /**
   * `HMAC-SHA256(<channel IDV secret>, externalId)`, computed by YOUR SERVER.
   * Never in the browser: the secret would be in your page source.
   */
  userHash?: string;
  /**
   * IDV v2: a short-lived HS256 JWT YOUR SERVER mints with the channel's
   * identity-verification secret, signing `sub` and the `email`, `name` and
   * `attrs` beside it rather than only the external id. Accepted alongside
   * `userHash`; at most 300 seconds of life, so mint it per render.
   */
  identityToken?: string;
  /**
   * A short-lived identity token from your identity provider, for a channel
   * verifying visitors against one (`identityVerification.mode` is `oidc`)
   * rather than against a shared secret. Its `sub` is the external id.
   *
   * **Prefer `getToken`.** A token lives about 60 seconds, so this one is
   * dead by the next render that re-initialises the widget.
   */
  userToken?: string;
  /**
   * Mint a short-lived identity token on demand, for a channel verifying
   * visitors against an identity provider (`identityVerification.mode` is
   * `oidc`) instead of a shared secret.
   *
   * A FUNCTION rather than a string because these tokens live ~60 seconds and
   * the widget re-sends an identity on every `init` and on every recovery
   * from a refused session. It is called per request and the result is never
   * stored anywhere.
   *
   * Do not pass `userHash` as well — a channel verifies one way or the other
   * and the server refuses the wrong credential for its mode.
   */
  getToken?: () => string | Promise<string>;
  attributes?: Record<string, unknown>;
}

/*
 * Six shapes live in `types-theme.ts`: `ChatlyTheme`, `ChatlyThemeOverlay`,
 * and — since 2026-10-25 — `ChatlyQuip`, `ChatlyBehavior`,
 * `ChatlyQuickLink` and `ChatlyCopy`.
 *
 * The first two moved when the theming surface pushed this file over the
 * repo's 650-line ceiling; the other four moved when the identity-loop
 * options (CHT-D10) pushed it over again. That second move groups them the
 * way the AUTHORITATIVE side already groups them — all six mirror shapes that
 * sit together in `packages/sdk-js/src/widget-appearance.ts`.
 *
 * `check-widget-wrapper-parity.mjs` reads BOTH files (`WRAPPER_TYPES`) and
 * concatenates them before extracting interfaces, so all four of the moved
 * pairs keep being compared and the gate needed no change. Note that this
 * comment used to argue the move was safe because the gate "does not
 * member-compare" the other file — true of `ChatlyThemeOverlay`, which has no
 * pair, and NOT true of a file that now holds four shapes that do. The real
 * reason it is safe is the concatenation, plus the per-pair floors that turn
 * a path that stops resolving into a loud "nothing was verified".
 *
 * Re-exported below, so no consumer's import changed.
 */
import type { ChatlyIdentityAnswer, ChatlyIdentityProvider } from './identity-loop.js';
import type {
  ChatlyAppearanceEvent,
  ChatlyEventName,
  ChatlyMessageAckEvent,
  ChatlyMessageEvent,
  ChatlyMessageReceivedEvent,
  ChatlyOpenEvent,
  ChatlySession,
  ChatlyUnreadEvent,
} from './types-events.js';
import type {
  ChatlyBehavior,
  ChatlyCopy,
  ChatlyQuickLink,
  ChatlyQuip,
  ChatlyTheme,
  ChatlyThemeOverlay,
} from './types-theme.js';

/*
 * `ChatlyIdentityAnswer` and `ChatlyIdentityProvider` are declared in
 * `identity-loop.js`, beside the `apply()` that reads them — the shape a
 * provider may answer with and the rules for refusing one are one
 * explanation, and splitting them would leave the type here with a comment
 * pointing at the code there.
 *
 * The import is type-only in BOTH directions (that module imports
 * `ChatlyIdentity` and `ChatlyInitOptions` from here), so the cycle is erased
 * at compile time and there is no module-evaluation order to get wrong. Same
 * arrangement as `types-theme.js` above, which is this file's precedent for a
 * declaration living next to its mechanism.
 */

/*
 * Re-exported so `./types.js` stays the one import path for consumers. Every
 * existing `import type { ChatlyCopy } from './types.js'` keeps working.
 */
export type {
  ChatlyAppearanceEvent,
  ChatlyEventName,
  ChatlyMessageAckEvent,
  ChatlyMessageEvent,
  ChatlyMessageReceivedEvent,
  ChatlyOpenEvent,
  ChatlySession,
  ChatlyUnreadEvent,
  ChatlyBehavior,
  ChatlyCopy,
  ChatlyIdentityAnswer,
  ChatlyIdentityProvider,
  ChatlyQuickLink,
  ChatlyQuip,
  ChatlyTheme,
  ChatlyThemeOverlay,
};

/**
 * Everything `Chatly.init()` accepts, minus `on`.
 *
 * The lifecycle callbacks are deliberately absent: a wrapper has to install
 * ONE stable set of them at boot and fan out to whatever the host most
 * recently passed, or every render with a fresh inline arrow function would
 * look like a changed config and re-initialise the widget. See
 * `ChatlyEmbedHandlers` and the `handlers` box in `embed.ts`.
 */
export interface ChatlyInitOptions {
  /** Channel public ID. Required. */
  publicId: string;
  /**
   * `'auto'`: let the page's consent manager decide where the widget may
   * store things (CHT-X02, ADR 0071) — IAB TCF v2.2, Google Consent Mode,
   * Cookiebot, OneTrust, Osano, Complianz, CookieYes or Cookie Munch, read
   * through each one's public page API. Until a decision is read, storage is
   * held to this visit (`sessionStorage`). No consent manager on the page:
   * no effect. See /guides/consent.
   *
   * An object is a decision the server already knows, per category, applied
   * exactly like `setConsent`. Read by the LOADER off the queued `init`,
   * before the widget itself loads — which is why this package queues it
   * untouched rather than stripping it like `lazy`.
   */
  consent?:
    | 'auto'
    | { functional?: boolean | null; analytics?: boolean | null; marketing?: boolean | null };
  /**
   * Cookie Munch only: the category that governs storage under
   * `consent: 'auto'`. Default `'support_chat'`. Any other category is
   * ordinary opt-in: refusing it denies storage.
   */
  consentCategory?: string;
  apiUrl?: string;
  realtimeUrl?: string;
  visitor?: ChatlyIdentity;
  theme?: ChatlyTheme;
  behavior?: ChatlyBehavior;
  quickLinks?: ChatlyQuickLink[];
  /**
   * Mount inside an element of your own layout instead of floating.
   *
   * Both wrappers set this for you from their own container, so a host rarely
   * passes it directly — in React it is `<ChatlyWidget inline />` and in the
   * custom element it is the `inline` attribute. Passing a selector by hand
   * still works and still carries the widget's refusal behaviour: a selector
   * that matches nothing mounts NOTHING and says so.
   */
  mountTo?: string | Element;
  /**
   * Whether the widget may use the visitor's browser storage. Default
   * **`'on-open'`** since 2026-10-19 — nothing is written to the device, and
   * no `visitor.*` telemetry is sent, until the visitor opens the panel or
   * starts a conversation.
   *
   * `'deny'` makes every read return nothing and every write a no-op, and
   * purges anything already written. For a consent banner: embed with
   * `'deny'`, then call `setStorageConsent(true)` if the visitor agrees.
   *
   * `'allow'` is the eager mode and is now the one you opt in to: a session
   * that survives a reload for every passer-by, and the live-visitor list
   * populated by everyone rather than by the people who engaged.
   *
   * `'on-open'` was missing from this union until 2026-10-19 while the widget
   * had accepted it since W-05 — so the mode that is now the DEFAULT could
   * not be written down in a React prop or a `<chatly-widget storage>`
   * attribute without a type error. Exactly the drift this package's parity
   * gate exists for, and the one it cannot see: it compares member names, not
   * their types.
   *
   * The OBJECT form sets Chatly's three categories separately —
   * `{ functional: 'on-open', analytics: 'deny', marketing: 'deny' }` — and a
   * category the object omits gets `'on-open'` rather than inheriting a
   * sibling. `functional` is the session, `analytics` is `chatly:seen` and
   * every `visitor.*` event, `marketing` is the `chatly:utm` entry. Those are
   * Chatly's own names: map your consent manager's onto them yourself, with
   * `setStorageConsent({ analytics: <their answer> })`.
   */
  storage?:
    | 'allow'
    | 'deny'
    | 'on-open'
    | {
        functional?: 'allow' | 'deny' | 'on-open';
        analytics?: 'allow' | 'deny' | 'on-open';
        marketing?: 'allow' | 'deny' | 'on-open';
      };

  /**
   * `'grant'` (attribute `analytics="grant"`) is the site's own statement that
   * visit analytics may be sent with no consent manager, for a site outside
   * any consent regime. An explicit `storage` analytics `'deny'` still wins.
   */
  analytics?: 'grant';

  /**
   * Whether the widget may produce its own behavioural telemetry — the
   * `visitor.page_view`, `visitor.returned`, `visitor.exit_intent`,
   * `visitor.scroll_depth` and `visitor.idle_threshold` events, and the
   * `chatly:seen` key behind `returned`.
   *
   * `tracking={false}` (or `tracking="false"` on the element) turns all five
   * off: no listener on your page, no key written, nothing `visitor.*` sent.
   * The granular form turns one feed off and leaves the rest —
   * `{ visits, exitIntent, scrollDepth }`, where `visits` carries the three
   * visit-level events and the other two name a gesture.
   *
   * Leaving it unset is NOT "on": visit telemetry is OPT-IN (since 0.17.0).
   * Every event above is held until ANALYTICS consent is granted — by a
   * consent manager (`consent="auto"`), `setConsent`, `setStorageConsent`, or
   * `analytics="grant"`. Opening the chat does NOT grant it. This option only
   * ever subtracts from what consent already permits. `track()` is never
   * affected.
   */
  tracking?:
    | boolean
    | {
        visits?: boolean;
        exitIntent?: boolean;
        scrollDepth?: boolean;
      };

  /**
   * What to do when the channel refuses the identity in `visitor` (or in a
   * later `identify()`): `'anonymous'` continues as an unverified, anonymous
   * visitor rather than leaving the visitor with a widget that cannot open.
   *
   * It never continues as the claimed identity: the session this browser was
   * holding is dropped, nothing is attached to `externalId`, and
   * `session.identityVerified` is false. An `error` event fires either way,
   * carrying `{ code: 'identity_rejected' | 'identity_missing_hash',
   * status }`.
   */
  identityFallback?: 'anonymous';

  cssOverrides?: string;
  copy?: ChatlyCopy;
  copyByLocale?: Record<string, ChatlyCopy>;
}

/**
 * Subscribers a wrapper forwards to.
 *
 * Every one is optional and every one is called with whatever the widget
 * emitted — these are not re-typed payloads, they are the widget's own.
 *
 * One member per `ChatlyEventName`, and `events.ts` is what holds that true
 * in both directions: a new event with no handler here is a type error there,
 * and so is a handler here that no event reaches.
 */
export interface ChatlyEmbedHandlers {
  onReady?: (session: ChatlySession) => void;
  /** `() => void` is still assignable — the detail was added, not required. */
  onOpen?: (detail: ChatlyOpenEvent) => void;
  onClose?: () => void;
  onMessage?: (message: ChatlyMessageEvent) => void;
  /** The server stored a message the visitor sent (`message.ack`). */
  onMessageAck?: (detail: ChatlyMessageAckEvent) => void;
  /**
   * An agent or bot message arrived while its thread was on screen
   * (`message.received`). `onMessage` does NOT fire for these — it has only
   * ever meant "the visitor sent something" — and a reply that lands while
   * the panel is closed is reported by `onUnread`.
   */
  onMessageReceived?: (detail: ChatlyMessageReceivedEvent) => void;
  /** The unread total changed, and once as soon as it is known (`unread`). */
  onUnread?: (detail: ChatlyUnreadEvent) => void;
  onAppearance?: (detail: ChatlyAppearanceEvent) => void;
  onConversation?: (detail: unknown) => void;
  /**
   * The thread on screen changed — see `'conversation.changed'`. Use this to
   * re-sync a mirrored thread on a move; `onConversation` also fires once at
   * startup, which this one deliberately does not.
   */
  onConversationChanged?: (detail: unknown) => void;
  onIdentified?: (session: ChatlySession) => void;
  onReset?: (detail: unknown) => void;
  /** A visitor pressed a `host_event` action on a rich block. */
  onAction?: (detail: unknown) => void;
  /**
   * A visitor pressed a `navigate` action: `{ path, label, conversationId,
   * messageId, actionId }`. Pass `path` to your router. Providing this handler
   * is what stops the widget navigating by itself.
   */
  onNavigate?: (detail: unknown) => void;
  /** A bot's ephemeral notice: `{ conversationId, replyTo, body }`. Not stored; gone if you miss it. */
  onNotice?: (detail: unknown) => void;
  /**
   * The widget could not do something it was asked to do.
   *
   * Reported rather than thrown. The widget's own `chatly:error` event is the
   * source, and it fires for a refused origin, a dead network and a 5xx —
   * none of which a host page can do anything about by crashing.
   */
  onError?: (detail: unknown) => void;
  /**
   * Which per-audience profile matched. `{ profile, matched }`.
   *
   * `unknown` like its neighbours: this package declares the event surface
   * and `@chatlychat/sdk-js` declares the payloads, so a wrapper consumer who
   * wants the shape imports it from there rather than having two copies of it
   * drift.
   */
  onProfile?: (detail: unknown) => void;
}

/**
 * When the widget bundle is fetched.
 *
 * Not an init option — the widget has no such setting and must not get one.
 * This is the LOADER's, and the loader is the only thing on the page early
 * enough for it to mean anything: by the time `widget.js` is running, the
 * bytes it would have saved are already spent.
 *
 *   - `false` (default) — fetch it on page load, which is what every embed
 *     has always done. ~44KB gzipped per page view, whether or not the
 *     visitor ever opens the chat.
 *   - `true` / `'launcher'` — fetch it when a visitor reaches for the chat.
 *     The loader paints a stand-in launcher that matches the real one and
 *     queues the click, so the panel opens as soon as the bundle lands. A
 *     RETURNING chatter — one this browser already holds a conversation for,
 *     `chatly:vr:<publicId>` — skips the wait: the bundle is fetched at once,
 *     so a reply that arrived while they were away can show its badge.
 *   - `'interaction'` — as `'launcher'`, and additionally pre-warm on the
 *     visitor's first interaction with the page. Suppressed under
 *     `prefers-reduced-data` or the browser's data saver; the
 *     returning-chatter fetch is not, because it is not a guess.
 *   - `'manual'` — fetch nothing and paint nothing until something calls
 *     `Chatly('load')`, **not even for a returning chatter**. That exception
 *     is the mode's whole point, so it is the mode to pick when you want to
 *     decide for yourself — ask `Chatly.hasSession()`, which the loader's
 *     stub answers before the bundle exists, and call `Chatly('load')` if
 *     you like the answer.
 *
 * `<ChatlyLauncher>` in `@chatlychat/widget-react` defaults to `'launcher'`
 * with `theme.hideLauncher`, which is the same thing for a first-time visitor
 * (no placeholder, nothing fetched until the host's button is used) and the
 * returning-chatter fetch for everyone else. It used to default to
 * `'manual'`, which made that reply invisible.
 *
 * Read ONCE, when `loader.js` evaluates. Changing it afterwards cannot
 * un-fetch a bundle, so the wrapper warns rather than pretending.
 */
export type ChatlyLazyMode = boolean | 'launcher' | 'interaction' | 'manual';

/** Where `loader.js` is served from, plus the init options. */
export interface ChatlyEmbedOptions extends ChatlyInitOptions {
  /**
   * The loader script URL.
   *
   * Defaults to `https://widget.chatlychat.com/loader.js`, which is where we
   * serve it. Set it only if you serve `loader.js` from your own CDN — and if
   * you do, `widget.js` and its chunks must sit beside your copy, because the
   * loader resolves them from its own URL. Point it at a loader that is not
   * beside its bundle and you get a chat bubble that renders and then cannot
   * load its engine, rather than a clean failure.
   *
   * `GET /v1/channels/:id` returns the right value for your deployment as
   * `embed.loaderUrl`. Use that rather than typing a host.
   */
  loaderUrl?: string;
  /**
   * Defer the widget bundle until a visitor wants it. See `ChatlyLazyMode`.
   *
   * Off by default, deliberately: this changes the behaviour of the one
   * script that runs on every page of a customer's site, and that is not a
   * thing to switch on for people who have not read about it.
   */
  lazy?: ChatlyLazyMode;
  /**
   * Your page's CSP nonce, for a host served with `script-src 'nonce-…'`.
   *
   * Under a nonce-based policy with no `'unsafe-inline'`, a script runs only
   * if it carries that response's nonce — so the embed's own `loader.js` tag
   * is stamped with this value, and it is published on the loader shim as
   * `window.Chatly.nonce` so that `widget.js`, the deferred chunks and the
   * panel's injected stylesheet are stamped with it too.
   *
   *     // Next.js: the nonce your middleware minted for THIS response
   *     const nonce = (await headers()).get('x-nonce') ?? undefined;
   *     <ChatlyWidget publicId="acme-web" nonce={nonce} />
   *
   * Leave it unset if your policy allows the widget's origin by host — the
   * embed then injects exactly what it always has, with no nonce attribute on
   * anything.
   *
   * **Give it a fresh value per response and never a hardcoded one.** A nonce
   * reused across responses is no better than `'unsafe-inline'`: anyone who
   * can read one page's source can then inject a script the next page will
   * run. Nothing in this package caches it — but a framework will happily
   * cache the HTML you put it in, so it has to come from the request.
   *
   * Read ONCE, before `loader.js` is injected. Changing it afterwards cannot
   * un-stamp a script that has already been inserted, so the wrapper warns
   * rather than pretending — the same treatment `lazy` and `loaderUrl` get.
   */
  nonce?: string;
  /**
   * Set the widget's locale once it is up, via `Chatly.setLocale()`.
   *
   * Not an init option — the widget has none. The strings come from `copy`
   * and `copyByLocale` in the embed, so `locale` picks between bundles YOU
   * supplied; asking for a locale with no bundle warns rather than appearing
   * to work. Changing it does NOT re-initialise the widget.
   */
  locale?: string;
  /**
   * Ask the host page who is signed in, and keep the widget in step (CHT-D10).
   *
   *     <ChatlyLauncher
   *       publicId="acme-web"
   *       identity={async () =>
   *         (await fetch('/api/chatly/identity', { cache: 'no-store' })).json()
   *       }
   *     />
   *
   * Called at boot, whenever the tab becomes visible again, and before any
   * re-init. Answer `{identity: {externalId, email, name, userHash}}` for a
   * signed-in visitor and `{identity: null}` for a signed-out one; a bare
   * identity object, or a bare `null`, is accepted too.
   *
   * **`null` signs the visitor out and nothing else does.** A provider that
   * throws, a route that answers 500, a body with no `identity` key and an
   * identity with no `externalId` all leave the visitor as they were, with a
   * warning — an identity route having a bad minute must not drop every
   * signed-in visitor's conversation.
   *
   * Sign-out and switch-account are both handled, and **you need no
   * `localStorage` key of your own** for it: the widget already stores the
   * external id it was last verified as at `chatly:xid:<publicId>`, which the
   * channel's storage declaration already discloses.
   *
   * It never re-initialises the widget, so an inline arrow is fine. This is a
   * `@chatlychat/widget-element` option and not one of the widget's, so a
   * plain `Chatly('init', { identity })` snippet embed does NOT get it — the
   * header of `identity-loop.ts` has the whole argument for both.
   */
  identity?: ChatlyIdentityProvider;
  /**
   * The declarative form of `identity`: a URL to `GET`.
   *
   *     <ChatlyLauncher publicId="acme-web" identityEndpoint="/api/chatly/identity" />
   *     <chatly-widget public-id="acme-web" identity-endpoint="/api/chatly/identity">
   *
   * Fetched with `cache: 'no-store'` — an identity response a browser, a
   * service worker or a CDN may reuse is one visitor's account served to the
   * next one on a shared device. Answer `{identity: {…} | null}` and send
   * `Cache-Control: private, no-store`;
   * `chatlyIdentityHandler({ secret, getUser })` in `@chatlychat/sdk-node`
   * writes that route for Next, Express and Fastify, `userHash` included.
   *
   * A non-2xx answer changes nothing — see `identity` for why that is not the
   * same as signing the visitor out. Credentials are left at fetch's default
   * (`same-origin`); a CROSS-ORIGIN route needs `credentials: 'include'` and
   * a CORS policy to match, so use `identity` and write the `fetch` yourself.
   *
   * Ignored, with a warning, when `identity` is also set.
   */
  identityEndpoint?: string;
}
