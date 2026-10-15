# @chatlychat/widget-element — changelog

## Unreleased

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

  **Not sufficient on its own.** The chain has three injection points and this
  package owns one; `apps/widget-loader` and `apps/widget` have to honour
  `window.Chatly.nonce` before a strict-CSP page actually renders a chat.

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
