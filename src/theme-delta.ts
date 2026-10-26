/**
 * What a changed `theme` prop needs: a live `setTheme`, or a re-init.
 *
 * `setTheme` MERGES at the TOP level (`{ ...override, ...theme }`), so it can
 * say "this key is now X" and cannot say "this key is gone". Compare top-level
 * KEY SETS therefore: a key that had a value and now has none (absent,
 * `undefined` — the same request, see `sameValue`) is `removed` and the caller
 * must re-init. Nested objects (`darkTheme`, `inlineTheme`, …) are NOT walked:
 * the widget layers them as whole values, so sending the new object replaces
 * the old one and a dropped nested key goes with it.
 */
import { sameValue } from './same-value.js';

import type { ChatlyTheme } from './types.js';

export function themeDelta(
  prev: ChatlyTheme | undefined,
  next: ChatlyTheme | undefined,
): { removed: boolean; changed: ChatlyTheme } {
  const a = (prev ?? {}) as Record<string, unknown>;
  const b = (next ?? {}) as Record<string, unknown>;
  const changed: Record<string, unknown> = {};
  let removed = false;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (sameValue(a[key], b[key])) {
      continue;
    }
    if (b[key] === undefined) {
      removed = true;
    } else {
      changed[key] = b[key];
    }
  }
  return { removed, changed: changed as ChatlyTheme };
}
