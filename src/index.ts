/**
 * `@chatlychat/widget-element` — the Chatly widget as a custom element, and the
 * embed lifecycle every framework wrapper shares.
 *
 * **This entry has no side effects.** Importing it does not define a custom
 * element and does not touch `document`. That is what lets
 * `@chatlychat/widget-react` depend on this package for the lifecycle without
 * registering a tag its consumers never asked for, and it is what makes the
 * package importable from a server bundle.
 *
 * To get `<chatly-widget>`:
 *
 *     import '@chatlychat/widget-element/register';
 *     // or, to choose the tag name:
 *     import { defineChatlyWidget } from '@chatlychat/widget-element';
 *     defineChatlyWidget('acme-chat');
 */
// `controls` moved to its own module when `embed.ts` crossed the 650-line
// ceiling; the published surface is unchanged.
export { controls } from './controls.js';
export { startWidget, subscribe, DEFAULT_LOADER_URL, type ChatlyEmbedHandle } from './embed.js';
/**
 * Start the bundle download without opening anything.
 *
 * Separate from `controls` on purpose: `controls` mirrors the methods
 * `window.Chatly` really has, and `load` is the LOADER's verb, not the
 * widget's. See the docblock in `lazy.ts`.
 */
export { prefetchWidget } from './lazy.js';
/**
 * The identity loop (CHT-D10) — the `~60 lines` three integrators each wrote.
 *
 * Nothing here has to be called: the loop is driven by the `identity` /
 * `identityEndpoint` options on `<ChatlyWidget>`, `<ChatlyLauncher>`,
 * `<chatly-widget>` and `startWidget`. These two exports are for a host
 * writing its own provider — `ChatlyIdentityProvider` to type the function,
 * `ChatlyIdentityAnswer` to type what its route answers — so neither has to
 * be hand-declared beside a `fetch`.
 *
 * `startIdentityLoop` itself is deliberately NOT exported. It takes the
 * dispatcher as a parameter and `embed.ts` owns the one that reaches the
 * mounted widget; a host that started a second loop would hold a second
 * `visibilitychange` listener the reference count knows nothing about, which
 * is the same class of mistake as calling `init` behind the lifecycle's back.
 */
export type { ChatlyIdentityAnswer, ChatlyIdentityProvider } from './types.js';
/**
 * Test-only. Resets the module's mount state between tests and reports what
 * it believes is mounted.
 *
 * Exported because `@chatlychat/widget-react`'s tests need it and a workspace
 * package cannot reach past the `exports` map to a deep path. Named with the
 * same `__testing` convention as `apps/realtime/src/gateway.ts` so it reads as
 * what it is. Calling it in production does nothing useful: it forgets the
 * widget without destroying it, which is the leak the refcount exists to
 * prevent.
 */
export { __testing } from './embed.js';
export {
  defineChatlyWidget,
  CHATLY_WIDGET_TAG,
  ELEMENT_EVENTS,
  type ChatlyElementEvent,
  type ChatlyWidgetElement,
} from './element.js';
/**
 * Every widget event, and the wrapper callback each one reaches.
 *
 * Exported because it is the answer to "which events are forwarded" in a form
 * that cannot disagree with the code — a host that wants to wire all of them
 * can iterate it rather than copy a list out of the README. See `events.ts`
 * for why this is the single source.
 */
export { EVENT_HANDLERS, WIDGET_EVENT_NAMES, type ChatlyHandlerName } from './events.js';
export type {
  ChatlyAppearanceEvent,
  ChatlyBehavior,
  ChatlyCopy,
  ChatlyEmbedHandlers,
  ChatlyEmbedOptions,
  ChatlyEventName,
  ChatlyIdentity,
  ChatlyInitOptions,
  ChatlyLazyMode,
  ChatlyMessageAckEvent,
  ChatlyMessageEvent,
  ChatlyMessageReceivedEvent,
  ChatlyOpenEvent,
  ChatlyQuickLink,
  ChatlyQuip,
  ChatlySession,
  ChatlyTheme,
  ChatlyUnreadEvent,
} from './types.js';
