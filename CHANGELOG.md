# @chatlychat/widget-element — changelog

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
