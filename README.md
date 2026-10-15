# @chatlychat/widget-element

The Chatly chat widget as a custom element. **Zero dependencies.**

```bash
pnpm add @chatlychat/widget-element
```

```html
<script type="module">
  import '@chatlychat/widget-element/register';
</script>

<chatly-widget public-id="acme-web" api-url="https://api.chatlychat.com"></chatly-widget>
```

Works in Vue, Svelte, Angular, Lit, Astro, Alpine, htmx and plain HTML —
anywhere a custom element works. For React, use
[`@chatlychat/widget-react`](../widget-react), which is built on this package's
lifecycle.

## Why not just paste the snippet?

If a `<script>` in your `<head>` is all you need, paste
[the snippet](https://chatlychat.com/docs/channel-web) and stop reading. This
package earns its keep when the widget's lifetime is tied to something your
framework owns:

- the chat should appear on some routes and not others, and your router
  unmounts the element;
- the theme or the visitor's identity comes from component state;
- your templates bind properties and listen for events, and you would rather
  write `<chatly-widget :theme="theme" @chatly-ready="…">` than reach into
  `window`.

It also handles three things a hand-written integration usually does not: a
widget left behind when its component unmounts, a re-boot caused by a DOM
move, and a re-initialisation caused by a re-render that changed nothing.

## Attributes

| attribute        | notes                                                    |
| ---------------- | -------------------------------------------------------- |
| `public-id`      | **Required.** The web channel's public ID.               |
| `api-url`        | Defaults to the host the loader was served from.         |
| `realtime-url`   | Rarely needed; the API reports the right one.            |
| `loader-url`     | Where `loader.js` is served from. Rarely set; see below. |
| `lazy`           | Defer the bundle until a visitor wants it; see below.    |
| `nonce`          | Your page's CSP nonce, if you serve one; see below.      |
| `locale`         | Applied with `setLocale()` once the widget is up.        |
| `css-overrides`  | CSS injected into the widget's shadow root.              |
| `inline`         | Boolean. Mount the chat inside this element.             |
| `theme`          | JSON.                                                    |
| `behavior`       | JSON.                                                    |
| `visitor`        | JSON.                                                    |
| `copy`           | JSON.                                                    |
| `copy-by-locale` | JSON.                                                    |
| `quick-links`    | JSON.                                                    |

Attributes are live: change one and the element applies it. A changed
`visitor` becomes an `identify()` and a changed `locale` a `setLocale()` —
neither re-mounts the widget. A change to anything else re-initialises it,
which closes an open panel (the widget has no `setTheme`; this is the honest
cost, and it only happens when a value really changed).

### `lazy` — deferring the bundle

`widget.js` is ~44KB gzipped and every visitor downloads it on every page
view, whether or not they ever open the chat. `lazy` changes that:

```html
<!-- a valueless attribute means "on", as everywhere else in HTML -->
<chatly-widget public-id="acme-web" lazy></chatly-widget>
<chatly-widget public-id="acme-web" lazy="interaction"></chatly-widget>
<chatly-widget public-id="acme-web" lazy="manual"></chatly-widget>
```

| value                | what happens                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| absent / `false`     | the bundle is fetched on page load, as it always has been                                                  |
| present / `launcher` | the loader paints a stand-in launcher matching your theme; using it fetches the bundle and opens the panel |
| `interaction`        | as above, plus a pre-warm on the visitor's first interaction with the page                                 |
| `manual`             | nothing is painted or fetched until something calls `Chatly('load')`                                       |

The stand-in launcher is drawn by `loader.js`, which is already on the page
and ~2KB. It is a real `<button>` in a shadow root, so it is keyboard
reachable and your page's CSS cannot reshape it, and its click rides the same
queue the snippet has always used — so the panel opens as soon as the bundle
replays it. A visitor is never left with no way to start a chat.

Two costs worth knowing. A `track()` call made in lazy mode waits in the
queue until something loads the bundle, so a visitor who leaves the page first
loses the event. And `lazy` is read ONCE, when `loader.js` evaluates:
changing the attribute afterwards warns rather than taking effect.

With `inline` there is no launcher to stand in for, so the trigger is the
element approaching the viewport instead. `prefers-reduced-data` and the
browser's data saver suppress the `interaction` pre-warm; neither ever turns
lazy mode on by itself.

### `nonce` — a page served with a strict CSP

If your page is served `script-src 'nonce-…'` with no `'unsafe-inline'`, give
the element that response's nonce:

```html
<chatly-widget public-id="acme-web" nonce="r4nd0m-per-response"></chatly-widget>
```

The element puts it on the `loader.js` script it injects, and publishes it as
`window.Chatly.nonce` so that `widget.js`, the deferred chunks and the panel's
own stylesheet carry it too. Without it, a nonce-only policy blocks the loader
and the only sign is a CSP violation in your console.

Two things to get right, and both are about where the value comes from rather
than about this attribute.

**A nonce is per-response.** Mint a fresh one for every page render and never
hardcode one: a nonce that repeats is no better than `'unsafe-inline'`, since
anyone who can read one page's source can then inject a script the next page
will run. Nothing here caches it — but whatever renders your HTML might, so it
has to come from the request.

**Read it from the property, not the attribute, if you ever read it back.**
HTML hides nonces: on a page with a header-delivered CSP the browser blanks the
`nonce` content attribute as soon as an element is connected and keeps the value
only in the element's internal slot, which `element.nonce` exposes. That applies
to `<chatly-widget>` as much as to a `<script>`, so this element reads its own
nonce through the property — a `getAttribute('nonce')` read works in every test
and returns nothing on a real page.

If your policy allows the widget's origin by host instead, leave the attribute
off. Nothing is stamped and the embed injects exactly what it always has.

### A malformed JSON attribute does not stop the chat

It is dropped, `console.error` says which attribute and why, and the widget
starts without it.

That is the opposite of what the widget does with a `mountTo` selector that
matches nothing, and deliberately so: a failed `mountTo` would put an
unexpected floating bubble on a page built to embed the chat, which reads as a
bug and is easy to miss, whereas a failed `theme` leaves a working chat in the
default colours and a named error in the console. Losing support chat on your
site over a trailing comma is the worse trade.

## Properties

Every JSON attribute is also a property, and the property wins:

```js
const chat = document.querySelector('chatly-widget');
chat.theme = { primaryColor: '#4f46e5', colorScheme: 'auto' };
chat.visitor = { externalId: 'u_42', email: 'jamie@acme.io', userHash };
chat.config = { behavior: { tabs: ['home', 'messages'] } }; // the whole object
```

Setting a property **before** the element is defined or upgraded works too,
which matters because every property-binding template engine can produce that
ordering.

`chat.controls` is the widget's post-boot method object — `open`, `close`,
`toggle`, `identify`, `setUser`, `setCustomAttributes`,
`deleteCustomAttribute`, `setLabel`, `removeLabel`, `setLocale`, `track`,
`registerPushToken`, `reset` — so a reference to the element is enough to
drive the chat. It is also exported on its own as `controls`.

`init` and `destroy` are deliberately absent: the element owns the lifecycle,
and calling them behind its back leaves it believing a widget is mounted that
is not.

## Events

The element re-dispatches every widget event as a DOM `CustomEvent`, with the
widget's payload on `detail`. They bubble and are `composed`, so a listener on
an ancestor hears them.

`chatly-ready`, `chatly-open`, `chatly-close`, `chatly-message`,
`chatly-conversation`, `chatly-identified`, `chatly-reset`, `chatly-action`,
`chatly-error`.

```html
<chatly-widget public-id="acme-web"></chatly-widget>
<script type="module">
  import '@chatlychat/widget-element/register';
  document.querySelector('chatly-widget').addEventListener('chatly-message', (e) => {
    console.log('reply from', e.detail.authorType);
  });
</script>
```

Hyphenated, not `chatly:message`: a colon is legal in an event name but not in
a Vue, Angular or Svelte template binding.

## Inline mounting

```html
<chatly-widget public-id="acme-web" inline style="height: 600px"></chatly-widget>
```

The chat fills the element instead of floating. No launcher, no corner offset,
and `close()` warns instead of working — hide or remove the element instead.

The element sets `display: block` on itself in this mode, because a custom
element is `display: inline` by default, which collapses to a zero-height box
and looks exactly like the widget failing to load. It also sets a 420px
`min-height` unless you set one.

## The main entry has no side effects

Importing `@chatlychat/widget-element` defines nothing and touches no DOM.
`@chatlychat/widget-element/register` is the opt-in that defines
`<chatly-widget>`, and `defineChatlyWidget('my-tag')` is there if you need a
different tag name. Calling either twice is safe.

This split is why `@chatlychat/widget-react` can depend on this package for the
embed lifecycle without registering an element its consumers never asked for,
and why nothing here crashes a server-side bundle — a top-level
`class X extends HTMLElement` would throw `HTMLElement is not defined` the
moment a Next.js server component imported so much as a type from here.

## One widget per page

`window.Chatly` is a singleton. Two connected `<chatly-widget>` elements with
different attributes is a misconfiguration: the first owns the configuration,
the second's attributes are ignored (its events still fire), and a console
warning says so. Two with the same configuration is harmless — which is what
makes an element inside a template that re-renders safe.

Moving the element in the DOM, or removing and re-adding it in the same task,
does **not** re-boot the widget. A `disconnectedCallback` is not necessarily
an unmount: `appendChild` elsewhere fires disconnect then connect, and so does
a framework re-keying a list.

## Composing with the snippet

If the page already has the snippet, this package does not fetch a second
loader — it queues its `init` onto the shim the snippet installed and lets that
loader replay it. The element's configuration wins. You do not need both, but
having both is not broken.

## Serving the loader yourself

`loader-url` defaults to `https://widget.chatlychat.com/loader.js`, which is
the right answer for almost everyone. Set it if you serve `loader.js` off your
own CDN, or to aim the element at another Chatly environment —
`GET /v1/channels/:id` returns the right value for the deployment you asked as
`embed.loaderUrl`, so read it from there rather than typing a host. The loader
resolves the bundle from its own URL, so a copy you serve needs `widget.js` and
the chunks it fetches sitting beside it.

The same response lists every origin a running widget connects to —
`connectOrigins`: the API host, and the realtime host under both `https:` and
`wss:` — and a CSP built from the script host alone lets the launcher paint and
then blocks every request it makes.

## License

MIT — see `LICENSE`.

---

## About this repository

This is a **mirror**. `@chatlychat/widget-element` is built from a private monorepo where the rest
of the platform, its migrations and its contract checks live, so a pull request here
cannot be merged directly — but a patch is still the fastest way to get something
fixed and we will port it with attribution.

What you can do here: read the source, run the tests, open an issue, or open a PR
and we will treat the diff as the proposal.

Issues: https://github.com/chatlychat/chatly-widget-element/issues · Docs: https://chatlychat.com/docs
