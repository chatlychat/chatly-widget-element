/**
 * The two things a wrapper has to do about lazy loading.
 *
 * Lazy mode itself lives in `apps/widget-loader` — it has to, because it is
 * about whether `widget.js` is fetched at all, and by the time the bundle is
 * running the question is settled. What belongs HERE is the small part that
 * only a framework wrapper needs:
 *
 *   1. `prefetchWidget()`, so a host-rendered launcher can start the download
 *      on hover and have the bundle ready by the time the click lands;
 *   2. `warnLateBootOption()`, so an option that is read once at boot and
 *      then changed in props says so instead of being silently ignored.
 *
 * It is a separate module from `embed.ts` because `embed.ts` is at 622 of the
 * repo's 650-line ceiling (`scripts/check-file-size.mjs`), and because this
 * is a different concern: `embed.ts` owns the mounted widget's lifecycle,
 * this owns the window before there is a widget at all.
 */

/**
 * Start fetching the bundle now, without opening anything.
 *
 * `Chatly('load')` is the loader's own trigger — see `WANTS_UI` in
 * `apps/widget-loader/src/lazy.ts`. The loader drops it from the replay
 * rather than handing it to the bundle, because the bundle has no such
 * method: `dispatch` in `apps/widget/src/index.ts` looks the name up on its
 * API object and warns `ignored a call to unknown method "load"` for anything
 * it does not find.
 *
 * Which is why this checks whether the bundle is already up before saying
 * anything. Without that check, a `<ChatlyLauncher>` on a page whose widget
 * had finished loading printed that warning into the embedder's console on
 * EVERY hover — a prefetch that is a no-op by then, reported as a mistake.
 * `typeof Chatly.init === 'function'` is the same "is it up yet" test
 * `embed.ts` uses at boot.
 *
 * NOT on `controls`, and not an accident. `controls` mirrors `ChatlyApi` —
 * the methods `window.Chatly` really has — and `scripts/check-widget-wrapper-parity.mjs`
 * compares the two in both directions precisely so a wrapper cannot invent
 * widget surface. `load` is loader surface. It is also why this does not go
 * through `dispatch`: that helper's "no widget is mounted" warning is the
 * right message for `open()` and the wrong one here, where the shim with
 * nothing behind it yet is exactly the state we are talking to.
 *
 * Silent when there is no shim at all. A prefetch is a hint; a host page that
 * hovers a button before any widget has been mounted has made no mistake
 * worth a console line, and `startWidget` has already warned if it tried to
 * mount without a `publicId`.
 */
export function prefetchWidget(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const chatly = (
    window as unknown as {
      Chatly?: ((...args: unknown[]) => void) & { init?: unknown };
    }
  ).Chatly;
  if (typeof chatly !== 'function' || typeof chatly.init === 'function') {
    return;
  }
  chatly('load');
}

/**
 * An option that cannot be honoured after the loader has run.
 *
 * `loaderUrl` and `lazy` are both read exactly once, by `loader.js`, at
 * script-evaluation time. A React consumer whose props change either one
 * afterwards is describing something that would need a page reload, and the
 * two honest answers are "reload" or "refuse". Refusing LOUDLY is the one
 * this repo keeps choosing: a prop that typechecks, reaches the wrapper and
 * does nothing is the control that appears to work.
 *
 * One message for both, with the names and values in it, because the useful
 * half of this warning is which value won.
 */
export function warnLateBootOption(option: string, from: unknown, to: unknown): void {
  console.warn(
    `[Chatly] ${option} changed from ${JSON.stringify(from)} to ${JSON.stringify(to)} after the ` +
      'widget loader ran. It is read once, when loader.js evaluates, so this needs a page ' +
      'reload; the running widget is unchanged.',
  );
}
