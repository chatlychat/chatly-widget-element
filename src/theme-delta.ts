/**
 * What a changed `theme` prop needs, as one object to hand to `setTheme`.
 *
 * Top-level KEY SETS are compared, not a deep diff: a key whose value changed
 * is carried with its new value, and a key that had a value and now has none
 * (absent, or `undefined` — the same request, see `sameValue`) is carried as
 * an explicit `undefined`. Nested objects (`darkTheme`, `inlineTheme`, …) are
 * NOT walked: the widget layers them as whole values, so sending the new
 * object replaces the old one and a dropped nested key goes with it.
 *
 * ── Why an explicit `undefined` and not a re-init (NPOL-2) ────────────────
 *
 * This used to return `removed: true` and the caller re-initialised the whole
 * widget, because `setTheme` was a plain top-level MERGE — it could say "this
 * key is now X" and not "this key is gone". A re-init closes the visitor's
 * open panel, so the obvious React code (`theme={{ primaryColor: brand }}`
 * recomputed on a state change that drops a key) threw away a conversation
 * in progress.
 *
 * The removal needed NO change in the widget, which is the part worth
 * writing down: `resolveWidgetTheme` layers the `setTheme` override with
 * `assignDefined` and not a spread (`apps/widget/src/theme.ts`), and that
 * helper skips a key whose value is `undefined`. So an `undefined` arriving
 * in the override has always meant "I no longer set this" and has always
 * fallen through to the snippet, the profile and then the channel's own
 * config — `set-theme.spec.tsx`'s "drops an undefined field to the snippet,
 * not to the built-in default" has pinned exactly that since CHT-S-09.
 *
 * The re-init was therefore guarding against a limit the widget did not
 * have. There is no version skew to worry about either: any bundle old
 * enough to lack `assignDefined` here predates `setTheme` itself.
 *
 * `changed` is deliberately NOT `Partial<ChatlyTheme>`-clean: it carries
 * `undefined` values on purpose, which is the whole mechanism.
 */
import { sameValue } from './same-value.js';

import type { ChatlyTheme } from './types.js';

export function themeDelta(
  prev: ChatlyTheme | undefined,
  next: ChatlyTheme | undefined,
): { changed: ChatlyTheme; count: number } {
  const a = (prev ?? {}) as Record<string, unknown>;
  const b = (next ?? {}) as Record<string, unknown>;
  const changed: Record<string, unknown> = {};
  let count = 0;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (sameValue(a[key], b[key])) {
      continue;
    }
    // `b[key]` is `undefined` for a removed key, which is the signal.
    changed[key] = b[key];
    count += 1;
  }
  return { changed: changed as ChatlyTheme, count };
}
