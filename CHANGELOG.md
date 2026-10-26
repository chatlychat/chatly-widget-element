# @chatlychat/widget-element — changelog

## 0.24.0 — 2026-10-26

### Added

- **`theme.colorScheme: 'host'`** — the widget follows the PAGE's own
  light/dark switch, so a site with a theme toggle needs no `MutationObserver`
  of its own. It reads `<html>`'s `data-theme`, then `class`, then the computed
  CSS `color-scheme`; point it elsewhere with
  `theme.hostScheme: { on: '#app', attribute: 'data-mode' }`. A value
  containing `dark` or `light` decides; both (`light dark`) or neither means
  "ask the OS", which is also what happens until the page has been read.

  Embed snippet / props only. The channel schema is
  `z.enum(['light','dark','auto'])`, so a workspace cannot select it in the
  dashboard yet, and `setTheme({ colorScheme: 'host' })` is not honoured — an
  explicit `light` or `dark` pushed live still wins.

- **`onError` is typed.** It was `(detail: unknown) => void`, so a host could
  not get even `message` typed. It is `ChatlyErrorEvent` now, exported from the
  package root.

  When `init` fails the event also carries `apiCode` (the server's error code,
  or null if no response arrived), `operation: 'init'` and `retryable`.
  `code` is UNCHANGED and still carries its documented values
  (`identity_rejected`, `identity_missing_hash`, `init_failed`) — the server's
  code went in a new field rather than replacing it, because redefining `code`
  would break any host switching on those. Misuse warnings still carry only
  `message`.

## 0.23.0 — 2026-10-26

**A changed `theme` is applied live, not by re-initialising.** `<chatly-widget theme>` and `<ChatlyWidget theme>` used to destroy and remount on any theme change, so a host computing its theme from light/dark state closed an open panel on the next render after a toggle. A changed value now goes through `setTheme` (a merge): the panel repaints in place with no network request.

**Re-init only when a top-level key is removed.** `setTheme` merges, so it cannot say "this key is gone"; a key that had a value and now has none (absent or `undefined`) still re-initialises. Nested objects (`darkTheme`, `inlineTheme`, …) are not walked — the widget layers them as whole values, so sending the new object also drops a removed nested key, live.

**Known limit.** The widget keeps its `setTheme` layer across `init` and it outranks the init theme, so after a re-init the new theme is re-asserted over it, but a key that was changed live and is then removed keeps its last live value until a page load. Fixing that needs a way to clear the layer in the widget itself. No `remountOnThemeChange` option was added: it would have the same stale layer.

## 0.22.0 — 2026-10-26

**`visitor: null` now means "signed out", and it is a privacy fix.** `reset()` on a sign-out has only ever worked as a TRANSITION — `visitor` held an identity and then went away. A page that loads already signed out never makes that transition, so the previous account's external id stayed in the browser (the widget keeps it at `chatly:xid:<publicId>` to spot an account switch). On a shared device that is the last person's identity outliving a sign-out that happened in another tab or another session, which is why integrators were keeping a "who was identified" key of their own and calling `reset()` by hand.

Pass `null` — `visitor={null}`, `visitor="null"`, `el.visitor = null` — and the widget compares its own stored identity on mount and resets itself if one is there. No host-side `localStorage` key is needed for it.

**An ABSENT `visitor` is unchanged and still does nothing.** That asymmetry is the whole of the opt-in: the widget cannot tell "the host signed this person out" from "the host has not resolved identity yet", and the second is the common case — a reset on it would drop a live conversation every time an auth check is slow. `null` is also ignored when `identity` or `identityEndpoint` is set, because a provider answers the same question under the same rule and is already asking; resetting first would flash an anonymous widget and cost a round trip.

`null` is this package's spelling and not the widget's: it is stripped before the option reaches `Chatly('init')`, which takes an identity or no key at all.

## 0.21.0 — 2026-10-26

**A call made before a widget has mounted is no longer dropped.** `controls.open()` from a "Chat with us" link that renders before `<chatly-widget>` (or before `<ChatlyWidget>`, one layer up) used to warn and go nowhere, so the visitor's first click was lost unless the host page buffered it themselves. It is now queued and replayed as soon as a widget mounts — the same thing the loader's own shim does for pre-bundle calls, one step earlier. One console warning still says the call was queued, because a page that never mounts a widget still gets nothing.

The queue lives in `dispatch`, not in a shim installed at import time: both published packages declare `"sideEffects": false`, so an import-time shim would be legal for a consumer's bundler to tree-shake away — working in development and vanishing in a production build — and would make this package unimportable from a server bundle.

## 0.20.0 — 2026-10-26

**Behaviour change, and it is a privacy fix.** `lazy` in any mode but `'off'` now makes NO request to any Chatly host until the visitor reaches for the chat — `load()`, `open()`, the stand-in launcher being clicked, or the first page interaction. Previously every mode fetched `loader.js` on page load, `'manual'` included, whose documented promise is that nothing loads until you call `load()`; that request carries the visitor's IP address, user agent and referrer, so a page with `lazy="manual"` still announced the visitor before they touched anything.

The cause was structural rather than a missing branch: the lazy decision lived inside the script you had to fetch to run it. The triggers (and the stand-in launcher) are part of this package now, so they run in your bundle. `lazy: 'off'`, which is the default and what an unset `lazy` means, is unchanged and eager.

Also new: `Chatly.hasSession()` now answers before any request has been made, which `lazy="manual"` needs in order to decide whether to call `load()` for a returning chatter.

## 0.19.0 — 2026-10-26

New event and handler for the bot's ephemeral notice: `chatly-notice` / `onNotice`, with `{ conversationId, replyTo, body }`. `ELEMENT_EVENTS` and `EVENT_HANDLERS` gain `notice` (17 events).

## 0.18.0 — 2026-10-26

New event and handler for the `navigate` card action: `chatly-navigate` / `onNavigate`, with `{ path, label, conversationId, messageId, actionId }`. Providing a handler is what stops the widget navigating by itself (it otherwise opens `location.origin + path`).

## 0.17.0 — 2026-10-26

**Behaviour change: visit telemetry is now opt-in.** The widget's own `visitor.page_view`, `visitor.returned`, `visitor.exit_intent`, `visitor.scroll_depth` and `visitor.idle_threshold` events are held and not sent until analytics consent is affirmatively granted. Opening the chat no longer grants it. New option `analytics: 'grant'` for sites outside any consent regime. `tracking: false` and the granular form are unchanged.

## 0.16.2 — 2026-10-25

`setConsent({ functional, analytics, marketing })`: tell the widget a consent decision from any consent banner, including your own. `consent: 'auto'` now reads the major CMPs (IAB TCF v2.2, Google Consent Mode v2, Cookiebot, OneTrust, Cookie Munch and others), not one vendor.

## 0.16.1 — 2026-10-25

- **`ChatlyTheme.anchor`** — mirrors `WidgetTheme.anchor` in
  `@chatlychat/sdk-js@0.18.0`: a CSS selector the panel sits above and tracks,
  falling back to the corner when it resolves to nothing.
  `<chatly-widget theme='{"anchor":"[data-chat-button]"}'>` and
  `startWidget({ theme: { anchor } })`.

A type addition. The element forwards `theme` whole, so nothing else moved.

## 0.8.0 — 2026-10-19

A **minor** bump: one method and two identity fields. Unpublished at the time
of writing — the version is here so the entry has somewhere to sit.

### Added

- **`controls.setTheme(theme)`** — re-theme a mounted widget without tearing
  it down. The `theme` attribute and property still re-initialise, which
  closes an open panel and issues a fresh `/v1/widget/init`; a host with a
  light/dark switch should call this instead and leave the attribute alone. It
  merges, like `setOffset`: pass what changed.

  The attribute is deliberately NOT routed through it. An attribute describes a
  whole theme, so a key you REMOVED would have to be un-applied, and a merge
  cannot express that while the stale attribute still sits underneath. Routing
  it needs a decision about what a removed key means; until then the method is
  the live path and the attribute is the declarative one.

- **`ChatlyIdentity.getToken?: () => string | Promise<string>`** and
  **`ChatlyIdentity.userToken?: string`** — for a channel verifying visitors
  against an identity provider (`identityVerification.mode` is `oidc`) rather
  than against a shared secret. The server has accepted a `userToken` since
  that door opened and no typed client could send one.

  **Prefer `getToken`.** These tokens live about 60 seconds, and the widget
  re-sends an identity on every `init` and on every recovery from a refused
  session — so a token passed as a string is dead by the next render that
  re-initialises. The provider is called per request and what it returns is
  never stored: not in `localStorage`, not in memory between calls.

  Do not pass `userHash` as well. A channel verifies one way or the other and
  the server refuses the wrong credential for its mode, naming which it
  wanted; nothing in the browser filters either one, deliberately, because
  that 403 is the only thing that knows the channel's mode.

## 0.7.0 — 2026-10-19

A **minor** bump: two option fields, one of them a union that was missing a
value the widget already supported. No breaking change to this package's API —
but the WIDGET's default changed underneath it, which is the part to read.

### Added

- **`identityFallback?: 'anonymous'`**, and the `identity-fallback` attribute.
  A rejected `userHash` used to take chat down with nothing the host could
  catch: `POST /v1/widget/init` answered 403, no `error` event reached a
  handler, and `ready` never fired, so one rotated secret removed support chat
  for every signed-in user silently. With the fallback set, the panel opens
  **anonymously** — it never attaches the identity you failed to prove — and a
  later `identify()` with a corrected hash still gets a real attempt.
- Two error codes worth subscribing to before the bundle loads:
  `identity_rejected` (the hash did not verify) and `identity_missing_hash`
  (the channel requires verification and none was sent).

### Fixed

- **`storage` accepts `'on-open'`.** The union here was `'allow' | 'deny'`
  while the widget had supported `'on-open'` for some time, so the custom
  element could not express the one mode that stores nothing until the visitor
  asks for chat — a TypeScript consumer got an error for a value that worked.
  The attribute comment also claimed "anything other than `deny`" enables
  storage, which stopped being true when unknown values began failing closed.

### Changed behaviour you did not opt into

**The widget's default storage mode is now `'on-open'`** (it was `'allow'`).
An embed that passes no `storage` option writes nothing to the device and
sends no visit telemetry until the visitor opens the panel; the widget's own
feeds are buffered, not dropped, and go out on engagement or on
`setStorageConsent(true)`. Your own `track()` calls are never gated.

An integrator found the old default storing a visitor token on a documentation
site for people who never asked for chat. If you were relying on it, pass
`storage="allow"` explicitly — that is now the mode that says so.

## 0.6.0 — 2026-10-16

### Added

- `onConversationChanged` and the `chatly-conversation-changed` DOM event, so
  all **thirteen** widget events are forwarded. A dot becomes a dash, as with
  `message.ack`.
- `controls.setOffset({ x, y, panelY })` and `ChatlyTheme.panelOffsetY`.

### Fixed

- A non-number `panelOffsetY`, `launcherSize`, `panelWidth` or `panelHeight`
  is ignored with one console warning instead of being written as a bare
  unitless value — which is invalid CSS, so the declaration was dropped and
  the panel could land below the viewport.

## 0.5.0 — 2026-10-16

### Added

- `controls.setOffset({ x?, y?, panelY? })` and `ChatlyTheme.panelOffsetY`,
  mirroring the widget surface. Unlike `mount`/`unmount` these are on
  `controls` with no parity exemption: they move inline properties on an
  already-mounted element, close nothing and emit no lifecycle event, so a
  second consumer calling them cannot desynchronise the first's view of the
  mount.

### Also in this release

- Docs only, and the docs were wrong in a way a customer reproduced (NCH-18).
  The `lazy` table said `manual` fetches nothing until `Chatly('load')` and
  said nothing about the **returning chatter** every other mode fetches for at
  once; the guide stated that preload unconditionally. Both rows now carry the
  exception, and the README has the by-hand recipe for `manual`.

- `ChatlyLazyMode`'s docblock no longer offers `<ChatlyLauncher>` as the
  example of a `'manual'` host: that component defaults to `'launcher'` with
  `theme.hideLauncher` as of `@chatlychat/widget-react`'s next release.

- `controls.hasSession()` documents when it starts answering. It read "`false`
  before the widget mounts", which undersold it in one direction and overfed
  it in the other: `loader.js` defines it on the shim before `widget.js`
  exists, which is what makes a `'manual'` preload possible — but the loader
  tag is `async`, so an effect in the same commit as the mount still gets
  `false`. That is why `<ChatlyLauncher>` preloads by choosing a `lazy` mode
  rather than by calling `hasSession()` and `load()`.

## 0.4.0 — 2026-10-16

- **All twelve widget events are forwarded.** `message.ack`,
  `message.received` and `unread` were named by `ChatlyEventName` in 0.3.0 —
  so `subscribe()` reached them — and had no `chatly-*` DOM event and no
  `ChatlyEmbedHandlers` callback, which meant `<chatly-widget>` and
  `<ChatlyWidget />` could not see them at all. New DOM events
  `chatly-message-ack`, `chatly-message-received` and `chatly-unread`, new
  handlers `onMessageAck`, `onMessageReceived` and `onUnread`, and the payload
  types `ChatlyMessageAckEvent` and `ChatlyUnreadEvent`.

  A dot becomes a dash, because Vue reads `@chatly-message.ack` as the event
  `chatly-message` with a modifier called `ack` — the same reason the prefix
  has always been `chatly-` and not `chatly:`.

  If you worked around it by reaching past this package — `subscribe()` for
  the three, or `window.Chatly.on('unread', …)` on the global — that
  workaround can go. Nothing about it was wrong and nothing about it breaks;
  the DOM event and the handler are simply there now.

- The forwarding chain is derived from one map instead of four hand-written
  lists. `EVENT_HANDLERS` and `WIDGET_EVENT_NAMES` are exported; the map is
  `satisfies Record<ChatlyEventName, keyof ChatlyEmbedHandlers>`, so a new
  widget event is a compile error here until it is wired, and a handler no
  event reaches is a compile error too. That is what drifted: four lists, nine
  entries each, and nothing comparing them to the twelve.

- `ChatlyMessageAckEvent` and `ChatlyUnreadEvent` are exported from the
  package root, beside the `ChatlyMessageReceivedEvent` that was already
  there and had no handler to be the payload of.

## 0.3.0 — 2026-10-15

- **`controls.getUnreadCount()` and `controls.hasSession()`**, and three event
  names the widget already emitted and this package could not name:
  `message.ack`, `message.received` and `unread`. A `<chatly-widget>` consumer
  got a TYPE ERROR for features the widget honours — the parity gate caught
  it, in the direction that matters: the widget offers it and the wrapper
  does not.

  Both reads go through a `read()` helper rather than `dispatch`, which
  returns nothing by construction, and that helper deliberately does NOT warn
  when no widget is mounted. `dispatch` warns because a header button wired to
  `open()` with no widget is a misconfiguration worth saying out loud; a READ
  before mount is the ordinary path, because an unread badge renders on first
  paint. Both fall back to the "nothing yet" answer, which is also the safe
  one: `0`, and `false`.

- `nonce` on `ChatlyEmbedOptions`, and a `nonce` attribute on
  `<chatly-widget>`: the page's CSP nonce, for a host served
  `script-src 'nonce-…'` with no `'unsafe-inline'`. Stamped on the `loader.js`
  script this package injects — before `appendChild`, because the CSP check
  runs on insertion — and published as `window.Chatly.nonce` so the loader and
  the bundle can stamp `widget.js`, the deferred chunks and the panel's
  stylesheet. Optional; with it unset the embed injects exactly what it always
  has.

  The attribute is read through `element.nonce` rather than
  `getAttribute('nonce')`: HTML blanks a nonce content attribute once an
  element is connected on any page with a header-delivered CSP, so an
  attribute read passes every test and returns nothing on the real page.

  **The other two injection points landed on 2026-10-15**, so a strict-CSP
  page now renders a chat end to end: `apps/widget-loader` stamps the
  `widget.js` script and the placeholder launcher's `<style>`, and
  `apps/widget` stamps the deferred chunk scripts and the `<style>` fallback.
  All three read the value from `window.Chatly.nonce`, which is what this
  package publishes. (One measured surprise from that work: the widget's
  primary stylesheet path is `adoptedStyleSheets`, which is CSSOM and not
  subject to `style-src` at all — the real blocker was always `script-src`.)

## 0.2.0 — 2026-10-14

- `lazy` on `ChatlyEmbedOptions`, and a `lazy` attribute on
  `<chatly-widget>`: defer the widget bundle until a visitor reaches for the
  chat. Written onto the loader shim before the loader script is appended —
  the loader reads it as its own script evaluates, so the ordering is the
  feature. Stripped from the widget's `init` like `loaderUrl` and `locale`,
  and a change after boot warns rather than being ignored.
- `prefetchWidget()`: start the bundle download without opening anything.
  Deliberately not on `controls`, which mirrors the methods `window.Chatly`
  really has — `load` is the loader's verb.

## 0.1.1 — 2026-10-13

- Release note: this is the version ON npm. `0.1.2` was accepted by npm and
  never completed — "staged" — so it is unusable and can never be published;
  the next release skips it.

- Metadata only; no code change. `repository` pointed at
  `github.com/livechat/platform`, which is a 404, so the "Repository" link on
  the npm page went nowhere. It was corrected in the repo before 0.1.0 shipped
  — but npm freezes metadata per version, so the correction needed a publish
  to take effect, and nothing compared the registry to the repo. An integrator
  reported it. `scripts/publish-packages.mjs` now checks that field on the
  registry after every publish.

## 0.1.0

- Initial release: `<chatly-widget>` custom element, `defineChatlyWidget()`,
  and the refcounted embed lifecycle (`startWidget`, `controls`) that
  `@chatlychat/widget-react` builds on.
- Zero dependencies. The main entry has no side effects; `/register` defines
  the tag.
