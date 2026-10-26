/**
 * Where the mount lifecycle meets the identity loop.
 *
 * ── Why this is a file and not four lines in `embed.ts` ─────────────────
 *
 * `embed.ts` crossed the repo's 650-line ceiling
 * (`scripts/check-file-size.mjs`) when the identity loop was wired in — the
 * third time that file has had to give something up, after `controls` and
 * `same-value`. The seam is the same one as those two: `embed.ts` owns the
 * MOUNT (claims, reference counting, boot, reconcile, teardown) and this owns
 * the ADAPTER between that mount and one feature it drives.
 *
 * The split is not free in bytes — no split in this repo has been — but this
 * package is installed by a bundler rather than injected on page load, so
 * there is no first-paint budget for it to spend. That is also why the
 * identity loop is in this package at all; see the header of
 * `identity-loop.ts`.
 *
 * ── The edge is one-way, and it has to be ───────────────────────────────
 *
 * Nothing here imports `embed.ts`. The loop needs to reach the mounted widget
 * — `identify()` and `reset()` go through `embed.ts`'s `dispatch` — so the
 * obvious spelling is an import, and the obvious spelling is a cycle:
 * `embed.ts` → here → `embed.ts`. ESM would tolerate it and it would be a
 * module-evaluation order to get wrong for no benefit, so the dispatcher is a
 * PARAMETER instead. `controls.ts` keeps the same rule in the other
 * direction, and its header says so.
 *
 * It also makes the whole path testable without a `window.Chatly`: a test
 * hands in a recording dispatcher and asserts on WHAT WAS DISPATCHED. That
 * matters more than it sounds. A fake widget that accepts every call agrees
 * with every bug — four mobile SDKs shipped an unusable realtime handshake
 * behind exactly that kind of green suite, and the fix was to assert on the
 * request rather than on the canned response.
 */
import {
  startIdentityLoop,
  storedExternalId,
  type IdentityDispatch,
  type IdentityLoop,
} from './identity-loop.js';

import type { ChatlyEmbedOptions, ChatlyIdentity } from './types.js';

/** `embed.ts`'s dispatcher, as much of it as this module needs. */
type Dispatch = (method: string, ...args: unknown[]) => void;

/** The part of the mount state this module reads and writes. */
export interface IdentityHolder {
  identity: IdentityLoop | null;
}

/**
 * What the identity loop is allowed to do to the widget: two methods.
 *
 * Narrow on purpose. The loop's job is to answer "who is signed in" and keep
 * the widget in step, and the only two verbs for that are `identify` and
 * `reset`. Handing it the whole dispatcher would let a future edit reach
 * `init` or `destroy` from inside a `visibilitychange` handler, behind the
 * reference count that `embed.ts`'s header says must not be bypassed.
 *
 * `reset` is dispatched with NO argument rather than with `undefined`. The
 * widget's `reset()` takes none, and `Chatly('reset', undefined)` would put a
 * stray entry in the loader's replay queue for no reason.
 */
export function identityDispatchVia(dispatch: Dispatch): IdentityDispatch {
  return (method: 'identify' | 'reset', identity?: ChatlyIdentity): void => {
    if (method === 'reset') {
      dispatch('reset');
      return;
    }
    dispatch('identify', identity);
  };
}

/**
 * Point the mount's identity loop at the owning claim's options.
 *
 * Starts one if there is none, because the claim that configures a provider is
 * not necessarily the claim that booted the widget: a page may render
 * `<ChatlyWidget publicId>` high in the tree and a
 * `<ChatlyLauncher identityEndpoint>` in a header rendered later, and
 * whichever mounts first owns the configuration. Without the start-on-update
 * branch the second one's provider would typecheck, reach the lifecycle and
 * never be called — this repo's most-repeated defect shape, and one list entry
 * away in either direction.
 *
 * `startIdentityLoop` returns null when the options configure no provider, so
 * the common case (no identity loop at all) stays null forever and costs a
 * null check per reconcile.
 */
export function syncIdentityLoop(
  holder: IdentityHolder,
  next: ChatlyEmbedOptions,
  dispatch: Dispatch,
): void {
  if (holder.identity === null) {
    holder.identity = startIdentityLoop(next, identityDispatchVia(dispatch));
    return;
  }
  holder.identity.update(next);
}

/**
 * The visitor prop changed. Sign in, or sign out.
 *
 * A host that renders `visitor={user ?? undefined}` is describing a sign-OUT
 * when it goes away, and `identify(undefined)` is not a thing. `reset()` is:
 * it forgets this visitor and boots a fresh anonymous session, and it drops
 * the identity permanently so the re-boot cannot resurrect the person who
 * just left.
 *
 * `null` is treated the same as a disappearing `undefined`, which is the
 * declarative half of the same statement — see `startIdentity`.
 */
export function identifyOrReset(
  visitor: ChatlyIdentity | null | undefined,
  dispatch: Dispatch,
): void {
  if (visitor === undefined || visitor === null) {
    dispatch('reset');
    return;
  }
  dispatch('identify', visitor);
}

/**
 * Start the identity machinery for a FRESH mount.
 *
 * Two things, and the second is the one with a privacy argument behind it
 * (NPOL-4). `reset()` on a sign-out works today only as a TRANSITION: a
 * `visitor` prop that held an identity and then went away. A page that loads
 * already signed out never makes that transition, so the previous account's
 * `chatly:xid:<publicId>` — the external id the widget was last verified as —
 * survives in the browser. On a shared device that is the last person's
 * identity outliving a sign-out that happened in another tab, which is why
 * integrators were keeping a "who was identified" key of their own and
 * resetting by hand.
 *
 * **An absent `visitor` still means nothing**, and an explicit `null` is what
 * means signed out. That asymmetry is the whole of the opt-in: the widget
 * cannot otherwise tell "the host signed this person out" from "the host has
 * not resolved identity yet", and the second is the common case — a host
 * whose identity route is slow renders one commit with no `visitor` at all.
 * Resetting on that would drop a live session on every slow endpoint. It is
 * the same rule, and the same reason, as THE ONE RULE in `identity-loop.ts`.
 *
 * Skipped when a provider is running, because the provider is the authority
 * on who is signed in and it is already asking: resetting here would flash an
 * anonymous widget and cost a round trip before its answer lands. Reading
 * `holder.identity` rather than re-deriving the provider is deliberate —
 * `identityProviderFor` WARNS when both `identity` and `identityEndpoint` are
 * set, and asking it twice would print that warning twice.
 *
 * Boot only, not every reconcile. A reconcile already handles a changed
 * `visitor` through `identifyOrReset`, and running this there would reset a
 * session a host had identified imperatively with `Chatly('identify', …)`
 * while holding `visitor={null}`.
 */
export function startIdentity(
  holder: IdentityHolder,
  options: ChatlyEmbedOptions,
  dispatch: Dispatch,
): void {
  syncIdentityLoop(holder, options, dispatch);
  if (
    holder.identity === null &&
    options.visitor === null &&
    storedExternalId(options.publicId) !== null
  ) {
    dispatch('reset');
  }
}
