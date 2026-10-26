/**
 * The widget's event surface, in ONE place.
 *
 * ── Why this file exists ────────────────────────────────────────────────
 *
 * The widget emits twelve events. Until 2026-10-16 this package forwarded
 * NINE: `message.ack`, `message.received` and `unread` were declared in
 * `ChatlyEventName` here — a consumer could pass them to `subscribe()` — and
 * nothing in the element or the React wrapper ever reached them. A host page
 * listening for `chatly-unread` on `<chatly-widget>` got silence from an
 * event the bundle was firing, which is the "control that appears to work"
 * failure one layer out: there was no error anywhere to notice.
 *
 * The reason it drifted is that the forwarding chain was FOUR hand-written
 * lists — `FORWARDERS` in `embed.ts`, `ChatlyEmbedHandlers` in `types.ts`,
 * `ELEMENT_EVENTS` plus `#handlers()` in `element.ts`, and `HANDLER_PROPS`
 * plus `handlersFrom` in each of the two React components. Adding an event to
 * `ChatlyEventName` and stopping there compiled, shipped, and did nothing.
 *
 * So: one map, and the compiler enforces both directions of it.
 *
 *  - `satisfies Record<ChatlyEventName, …>` makes a NEW event a type error
 *    here until it is mapped. That is the direction that actually failed.
 *  - the value type `keyof ChatlyEmbedHandlers` makes a mapping to a handler
 *    that does not exist a type error.
 *  - `UnreachableHandler` below makes a handler no event reaches a type
 *    error, which is the reverse direction `element.ts` used to get from
 *    writing `#handlers()` out by hand.
 *
 * Everything downstream — the subscriptions, the DOM event names, the React
 * props — is derived from this object rather than restated. `element.spec.ts`
 * drives every entry end to end, so a thirteenth event with no forwarding
 * fails a test instead of shipping quietly.
 *
 * Type-only imports: this package has zero dependencies and this module adds
 * no runtime import of its own.
 */
import type { ChatlyEmbedHandlers, ChatlyEventName } from './types.js';

/**
 * Widget event name → the `ChatlyEmbedHandlers` member that receives it.
 *
 * The order is `ChatlyEventName`'s, and it is the order the forwarders are
 * subscribed in. Nothing depends on it.
 */
export const EVENT_HANDLERS = {
  ready: 'onReady',
  open: 'onOpen',
  close: 'onClose',
  message: 'onMessage',
  'message.ack': 'onMessageAck',
  'message.received': 'onMessageReceived',
  unread: 'onUnread',
  appearance: 'onAppearance',
  conversation: 'onConversation',
  'conversation.changed': 'onConversationChanged',
  identified: 'onIdentified',
  reset: 'onReset',
  action: 'onAction',
  navigate: 'onNavigate',
  error: 'onError',
  profile: 'onProfile',
} as const satisfies Record<ChatlyEventName, keyof ChatlyEmbedHandlers>;

/** The handler names, as a union — `'onReady' | 'onOpen' | …`. */
export type ChatlyHandlerName = (typeof EVENT_HANDLERS)[ChatlyEventName];

/**
 * A handler that no event reaches, which must be `never`.
 *
 * Exported because this is a compile-time assertion and an unexported type
 * alias nobody reads is an unused declaration. If you have landed here
 * because `_NoUnreachableHandler` fails to compile, `ChatlyEmbedHandlers`
 * grew a member with no event behind it: either map it above or remove it,
 * because a documented callback that can never fire is worse than none.
 */
export type UnreachableHandler = Exclude<keyof ChatlyEmbedHandlers, ChatlyHandlerName>;
type Assert<T extends true> = T;
export type _NoUnreachableHandler = Assert<UnreachableHandler extends never ? true : false>;

/**
 * Every widget event, as an array.
 *
 * `Object.keys` preserves insertion order for string keys, and the cast is
 * the one place this module trusts itself: the keys ARE `ChatlyEventName` by
 * the `satisfies` above, and `Object.keys` erases that to `string[]`.
 */
export const WIDGET_EVENT_NAMES = Object.keys(EVENT_HANDLERS) as readonly ChatlyEventName[];

/**
 * A widget event name with its dots turned into dashes, at the type level.
 *
 * `message.ack` → `message-ack`. See `domSuffix` for why.
 */
export type Dashed<S extends string> = S extends `${infer Head}.${infer Tail}`
  ? `${Head}-${Dashed<Tail>}`
  : S;

/** The DOM event suffixes — what `chatly-` is prefixed to. */
export type ChatlyDomEventSuffix = Dashed<ChatlyEventName>;

/**
 * The DOM suffix for a widget event: every dot becomes a dash.
 *
 * `chatly-message.ack` would be a legal DOM event name and an unusable one:
 * Vue reads a dot in `@chatly-message.ack` as an event MODIFIER, so the
 * listener would bind to `chatly-message` and silently never fire. That is
 * the same reasoning that made the prefix `chatly-` rather than `chatly:` —
 * a colon is legal in an event name and not in a Vue, Angular or Svelte
 * template binding — applied to the separator inside the name.
 *
 * Kebab is also already this package's spelling for everything that crosses
 * into HTML: `copyByLocale` is the `copy-by-locale` attribute.
 */
export function domSuffix(name: ChatlyEventName): ChatlyDomEventSuffix {
  // The replacement is exactly what `Dashed` does to the type.
  return name.replace(/\./g, '-') as ChatlyDomEventSuffix;
}
