/**
 * Calls a host made before there was anything to make them to.
 *
 * ── The defect (NPOL-5) ─────────────────────────────────────────────────
 *
 * `useChatly().open()` in a "Chat with us" link that renders BEFORE
 * `<ChatlyWidget>` has mounted — a header in a layout whose widget sits
 * further down, a button in a shell that renders while the channel id is
 * still being fetched — went nowhere. `dispatch` found no `window.Chatly`,
 * warned, and dropped the call. The visitor's click was simply lost, and the
 * only fix available to the integrator was to buffer it themselves.
 *
 * Which is odd, because the shim the loader installs IS a queue: once a
 * widget has booted, every pre-bundle call waits in `shim.q` and is replayed
 * when `widget.js` arrives. The gap was never "too early to queue", it was
 * "too early for a queue to EXIST". So this is that queue, one step earlier.
 *
 * ── Why here and not at import time ─────────────────────────────────────
 *
 * The obvious alternative is for this package to install the shim as it is
 * imported, so there is always something to queue on. Both published packages
 * declare `"sideEffects": false`, which is a promise to the consumer's bundler
 * that importing a module and using none of its exports can be dropped
 * entirely — and `index.ts` says in its own header that importing it touches
 * no `document` and defines no element. An import-time shim would break both:
 * it would be legal for Rollup or webpack to tree-shake it away (so the fix
 * would work in development and vanish in a production build, which is the
 * worst failure shape available), and it would make this package unimportable
 * from a server bundle.
 *
 * Queuing inside `dispatch` needs no side effect at all: the queue is created
 * by the first call that would otherwise have been dropped.
 *
 * ── The replay, and its ordering ────────────────────────────────────────
 *
 * `boot` drains it after the widget's own `init` is queued, so a replayed
 * `open` lands behind the `init` it depends on. `dispatch` also drains on any
 * successful call, which covers the one case `boot` cannot see: the host
 * pasted the snippet as well, so a shim appeared without this package
 * installing it.
 *
 * Nothing drains if no widget ever mounts, which is the state the warning
 * below is about — and the reason it still says what to do rather than only
 * that the call was queued.
 */

/**
 * Enough for a visitor's clicks while a channel id is in flight, and not a
 * leak if the host never mounts a widget at all: without a cap, a `track()`
 * in a scroll handler on a page with no `<ChatlyWidget>` would grow this
 * array for as long as the tab is open. The oldest calls are the ones worth
 * keeping — a dropped first click is the bug — so overflow drops the newest.
 */
const CAP = 50;

let pending: unknown[][] = [];
let warned = false;

/** Hold a call that had no shim to go to. */
export function queueUntilMounted(method: string, args: unknown[]): void {
  if (!warned) {
    warned = true;
    console.warn(
      `[Chatly] ${method}() was called before a widget was mounted. It is queued and will ` +
        'run as soon as one is — but nothing runs if none ever mounts, so make sure ' +
        '<ChatlyWidget> (or <chatly-widget>) is rendered somewhere on the page.',
    );
  }
  if (pending.length < CAP) {
    pending.push([method, ...args]);
  }
}

/**
 * Replay everything queued, in order, through the shim that now exists.
 *
 * Emptied BEFORE the replay: a queued call that dispatches another one (the
 * identity loop's `identify`, say) must not find itself in the list it is
 * being replayed from.
 */
export function drainPending(shim: (...args: unknown[]) => void): void {
  if (pending.length === 0) {
    return;
  }
  const queued = pending;
  pending = [];
  for (const call of queued) {
    shim(...call);
  }
}

/** Test-only, via `__testing.reset()`: module state outlives a test file. */
export function resetPending(): void {
  pending = [];
  warned = false;
}
