/*
 * The widget event names and the payloads they carry. Split out of `types.ts`
 * at the 650-line ceiling; `types.ts` re-exports every name, so no import path
 * changed.
 */

/**
 * The widget's event names, as `Chatly.on()` spells them.
 *
 * `ready` is a state rather than a moment — the widget replays the last one
 * to a late subscriber — and both wrappers rely on that, because a React
 * effect or a `connectedCallback` can easily run after the session is up.
 */
export type ChatlyEventName =
  | 'ready'
  /** The panel opened. Carries `ChatlyOpenEvent`. */
  | 'open'
  | 'close'
  | 'message'
  /**
   * A message the visitor sent has been accepted by the server (W-09).
   *
   * Carries `{ id, localId, conversationId }`. `id` is the persisted id and
   * `localId` is the one the thread showed while the message was in flight,
   * so a host mirroring the thread can swap one for the other. It fires only
   * after acceptance — a send that failed announces nothing.
   */
  | 'message.ack'
  /**
   * A message from an agent or a bot arrived while its thread was on screen.
   * Carries `ChatlyMessageReceivedEvent`. Never fires for history loaded when
   * a thread is opened.
   */
  | 'message.received'
  /**
   * The unread total changed (W-06). Carries `{ count }`.
   *
   * Fires the first time the total is known as well as on every change, so a
   * badge can render from the event alone and never has to poll
   * `getUnreadCount()`.
   */
  | 'unread'
  | 'conversation'
  /**
   * The thread on screen CHANGED — `conversation` minus the report that
   * accompanies the panel opening, for a host mirroring the visitor's current
   * thread. Detail is `{ conversationId }`, null off a thread. Added in the
   * widget on 2026-10-16; forwarded here as `chatly-conversation-changed`.
   */
  | 'conversation.changed'
  | 'identified'
  | 'reset'
  /**
   * Which per-audience profile this visitor matched, or that none did.
   *
   * Carries `{ profile, matched }` — the operator-facing profile name (null
   * for a profile left unnamed) and whether any profile applied at all. Both
   * are needed, because an unnamed match and no match are different answers.
   * Forwarded here as `chatly-profile`. See `@chatlychat/sdk-js` for the full
   * note on when it fires.
   */
  | 'profile'
  | 'appearance'
  | 'action'
  /**
   * A visitor pressed a `navigate` action: go to `detail.path` on your site.
   * With no handler the widget navigates itself. See `@chatlychat/sdk-js`.
   */
  | 'navigate'
  | 'error';

/** What a `ready` or `identified` event carries. */
export interface ChatlySession {
  contactId: string | null;
  workspaceId: string;
}

/**
 * What a `message` event carries.
 *
 * `id` is the MESSAGE's id. `conversationId` is the thread it landed in, or
 * `null` before one exists — it was added to the widget's payload because `id`
 * alone gave a host page nothing to correlate against, and it was missing here
 * for exactly as long as it takes a second copy of a shape to drift: the
 * widget emitted the key, the React wrapper's `onMessage` type did not declare
 * it, so a consumer reading `m.conversationId` got a type error for a value
 * that was sitting in the object. `check-widget-wrapper-parity.mjs` compares
 * this interface against `InitOptions.on.message`'s parameter now.
 */
export interface ChatlyMessageEvent {
  id: string;
  body: string;
  authorType: string;
  conversationId: string | null;
}

/**
 * What an `open` event carries (Crossly round 6, #5).
 *
 * `conversationId` is the thread the panel opened ON, or `null` for the home
 * screen, a tab, an article, or a new conversation not yet sent. Until
 * 2026-10-15 the widget emitted `{}`, so a host could not tell "opened to read
 * a reply" from "opened from cold".
 */
export interface ChatlyOpenEvent {
  conversationId: string | null;
}

/**
 * What a `message.received` event carries: an agent or bot message that
 * arrived while its thread was on screen. `id` is the STORED message's id —
 * the one webhooks and the REST API use — so a host can correlate it.
 *
 * `onMessageReceived` is the wrapper callback. This comment used to say there
 * was none and that `Chatly.on('message.received', …)` was the only route,
 * which was true and was the bug: the event was subscribable in TypeScript
 * and reached neither wrapper. See `events.ts`.
 */
export interface ChatlyMessageReceivedEvent {
  id: string;
  conversationId: string;
  authorType: 'agent' | 'bot';
  body: string;
}

/**
 * What a `message.ack` event carries: the server stored a message the VISITOR
 * sent.
 *
 * `id` is the persisted id and `localId` the placeholder the thread showed
 * while the message was in flight, so a host mirroring the thread can swap
 * one for the other. `conversationId` is never null here — a stored message
 * has a thread. It fires only on acceptance; a send that failed announces
 * nothing.
 */
export interface ChatlyMessageAckEvent {
  id: string;
  localId: string;
  conversationId: string;
}

/**
 * What an `unread` event carries: agent and bot messages the visitor has not
 * had on screen, across their threads.
 *
 * Fires the first time the total is known as well as on every change, and is
 * replayed to a late subscriber — so a badge can render from this alone and
 * never has to poll `getUnreadCount()`.
 */
export interface ChatlyUnreadEvent {
  count: number;
}

/** The scheme `appearance` RESOLVED — never `'auto'`, which is the question. */
export interface ChatlyAppearanceEvent {
  scheme: 'light' | 'dark';
}
