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
export {
  controls,
  startWidget,
  subscribe,
  DEFAULT_LOADER_URL,
  type ChatlyEmbedHandle,
} from './embed.js';
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
export type {
  ChatlyBehavior,
  ChatlyCopy,
  ChatlyEmbedHandlers,
  ChatlyEmbedOptions,
  ChatlyEventName,
  ChatlyIdentity,
  ChatlyInitOptions,
  ChatlyMessageEvent,
  ChatlyQuickLink,
  ChatlyQuip,
  ChatlySession,
  ChatlyTheme,
} from './types.js';
