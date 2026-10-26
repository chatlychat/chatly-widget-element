/**
 * When this package is allowed to contact Chatly at all.
 *
 * ── The leak ────────────────────────────────────────────────────────────
 *
 * `boot` used to end with an unconditional `injectLoader`, so every embed
 * fetched `https://widget.chatlychat.com/loader.js` on page load — in every
 * lazy mode, including `'manual'`, whose documented promise is that nothing
 * loads until the host calls `Chatly('load')`. The request carries the
 * visitor's IP address, user agent and referrer, so a page that had chosen
 * `lazy: 'manual'` and `storage: 'deny'` still told us a visitor was there
 * before they touched anything. `storage` governs the device; it was never a
 * network setting, and nothing said so.
 *
 * The cause was structural rather than a missing branch: the code that
 * decides whether to fetch the bundle lived INSIDE the artifact you have to
 * fetch first. `lazy-triggers.ts` is in this package now, so the decision
 * runs in the site's own bundle and the first request to any Chatly host
 * happens when the visitor reaches for the chat.
 *
 * ── `lazy: 'off'` is still eager, deliberately ──────────────────────────
 *
 * `off` is the default and it means "fetch on page load". Making the default
 * deferred would be a silent behaviour change for every existing embed — the
 * launcher appearing late on pages that never asked for that — so the
 * privacy property is something a host opts into with the mode that already
 * describes it. `'manual'`, `'launcher'` and `'interaction'` now all keep it.
 */
import { injectLoader } from './inject-loader.js';
import { armLazyLoad, hasStoredThread, normalizeLazy, type LoaderShim } from './lazy-triggers.js';

/** The three things the fetch decision needs out of the mount state. */
export interface DeferredFetch {
  loaderUrl: string;
  lazy: unknown;
  nonce: string | undefined;
}

/**
 * Arm the fetch of `loader.js` and return the teardown.
 *
 * The teardown takes down the stand-in launcher, the interaction listeners
 * and the queue patch. Two things call it: the widget's own `ready`, because
 * by then the real launcher is on screen, and `release()` on unmount —
 * without the second, a React route change away from the widget would leave
 * a dead placeholder and a live `pointerdown` listener behind.
 */
export function armLoaderFetch(shim: LoaderShim, mount: DeferredFetch): () => void {
  /*
   * `hasSession()` is normally installed by `loader.js`. Deferring the loader
   * means a host in `'manual'` mode — the one most likely to ask — would call
   * `Chatly.hasSession()` and get `undefined is not a function`, which is the
   * exact question the mode exists to answer. So it is installed here too,
   * from the same `hasStoredThread`, and the bundle replaces both with its own
   * implementation of the same test on replay.
   */
  shim.hasSession = () => hasStoredThread(shim.publicId);

  const fetchLoader = (): void => {
    /*
     * The decision is MADE by the time we get here, so the loader must not
     * make it again. It reads `lazy` off the shim as its own script evaluates
     * and would arm a second set of triggers — in `'launcher'` mode drawing
     * nothing (`drawPlaceholder` refuses a second host) and then waiting for
     * another click that the visitor has already given. Deleted rather than
     * set to `'off'` because `normalizeLazy(undefined)` IS `'off'` and an
     * absent option is what the loader's own default path expects.
     */
    delete shim.lazy;
    injectLoader(mount.loaderUrl, mount.nonce);
  };

  const mode = normalizeLazy(mount.lazy);
  if (mode === 'off') {
    fetchLoader();
    return () => undefined;
  }

  let disarm = (): void => undefined;
  /*
   * Queued, so it is replayed after the widget's own `init`. `ready` is the
   * one widget event that survives a late subscription — the widget replays
   * the last one — so this cannot miss it even if the bundle wins the race.
   */
  const onReady = (): void => {
    disarm();
    /*
     * Through the LIVE global, not the captured `shim`. By the time `ready`
     * fires the bundle has replaced `window.Chatly` with its own object, and
     * `shim` is the superseded queue function — an `off` pushed there lands on
     * an array nothing will drain again, so the subscriber would survive every
     * mount/unmount cycle. That is the leak the forwarder comment in
     * `embed.ts` exists about.
     */
    (window as unknown as { Chatly?: (...args: unknown[]) => void }).Chatly?.(
      'off',
      'ready',
      onReady,
    );
  };
  shim('on', 'ready', onReady);

  disarm = armLazyLoad(mode, { shim, nonce: mount.nonce, load: fetchLoader });
  return () => {
    disarm();
  };
}
