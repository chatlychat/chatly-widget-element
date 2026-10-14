/**
 * The warning for a second mount with different options.
 *
 * Moved out of `embed.ts`, which this repo's 650-line ceiling caught at 657
 * after lazy mode and the storage-consent control landed in it on the same
 * day. It is a self-contained diagnostic with one caller and no state beyond
 * its own once-only latch, which made it the honest thing to lift.
 */
import { sameOptions } from './same-value.js';

import type { ChatlyEmbedOptions, ChatlyInitOptions } from './types.js';

/** Once per page. A warning that repeats on every render is noise. */
let warned = false;

/**
 * A second claim with different options.
 *
 * There is one `window.Chatly`, so the second set cannot be honoured — the
 * first mount's configuration stays in force and the second component's
 * handlers still fire. Silence here would be the worst outcome: a developer
 * who renders `<ChatlyWidget>` in two layouts sees one of their two themes
 * applied, at random, with nothing to search for.
 */
export function warnOnConflict(
  mount: { claims: Map<unknown, { options: ChatlyEmbedOptions }> },
  options: ChatlyEmbedOptions,
  /**
   * How to reduce an embed's options to the set that actually reaches `init`.
   *
   * Passed in rather than imported: `initOptionsFor` lives in `embed.ts`,
   * which imports this module, and reaching back for it would be a cycle. A
   * parameter also makes the comparison testable without constructing a
   * mount.
   */
  normalise: (options: ChatlyEmbedOptions) => ChatlyInitOptions,
): void {
  if (warned) {
    return;
  }
  const owner = mount.claims.values().next().value;
  if (owner === undefined || sameOptions(normalise(owner.options), normalise(options))) {
    return;
  }
  warned = true;
  console.warn(
    '[Chatly] a second widget was mounted with different options. There is only one ' +
      'widget per page, so the FIRST mount owns the configuration — the second one is ' +
      'ignored (its event handlers still fire). Render one <ChatlyWidget>, high in the ' +
      'tree, and use useChatly() elsewhere.',
  );
}

/** Let the next page (or the test harness) warn again. */
export function resetConflictWarning(): void {
  warned = false;
}
