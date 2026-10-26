/**
 * The overlay palette, split out of `types.ts` at the 650-line ceiling.
 *
 * One interface and nothing else. `check-widget-wrapper-parity.mjs` reads
 * `ChatlyTheme` out of `types.ts` by path and does not compare this shape, so
 * this file is invisible to it — deliberately: that is what made the move
 * safe rather than a silently unaudited type.
 */
/**
 * An overlay palette for `darkTheme` and `inlineTheme`. Mirrors
 * `WidgetThemeOverlay` in `@chatlychat/sdk-js`, which carries the reasoning:
 * not recursive, and a deliberate SUBSET — no position, no panel size, no
 * `hideBranding`, no `icons`, no `launcherIcon`.
 */
export interface ChatlyThemeOverlay {
  primaryColor?: string;
  primaryContrast?: string;
  background?: string;
  backgroundSubtle?: string;
  foreground?: string;
  foregroundMuted?: string;
  border?: string;
  bubbleAgentBg?: string;
  bubbleAgentFg?: string;
  dangerColor?: string;
  successColor?: string;
  warningColor?: string;
  borderRadius?: number | string;
  fontFamily?: string;
  fontSize?: number | string;
  headerStyle?: 'gradient' | 'solid' | 'plain' | 'light';
  headerGradient?: [string, string];
  // ── Cards (read by the deferred commerce chunk's stylesheet) ───────
  cardBg?: string;
  cardBorder?: string;
  cardRadius?: number | string;
  cardShadow?: string;
  /** `aspect-ratio` for the card image, e.g. `4 / 3`. */
  cardImageRatio?: string;
  cardImageFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  cardPerView?: string;
  /** Title lines before clamping, as a STRING: `'2'`. See the SDK's note. */
  cardTitleLines?: string;
  cardPriceColor?: string;
  cardPriceSize?: number | string;
  cardBadgeBg?: string;
  cardBadgeFg?: string;
  cardButtonBg?: string;
  cardButtonBorder?: string;
  cardButtonFg?: string;
  // ── Quick-reply chips (same chunk) ─────────────────────────────────
  chipBg?: string;
  chipFg?: string;
  chipBorder?: string;
  chipRadius?: number | string;
  chipHoverBg?: string;
  chipWrap?: 'wrap' | 'nowrap';
  // ── Header geometry ───────────────────────────────────────────────
  headerHeight?: number | string;
  headerTitleSize?: number | string;
  headerSubtitleSize?: number | string;
  headerLogoOnly?: boolean;
  // ── Composer ──────────────────────────────────────────────────────
  composerBg?: string;
  composerBorder?: string;
  composerRadius?: number | string;
  composerPlaceholder?: string;
  composerIcon?: string;
  composerSendBg?: string;
  composerSendFg?: string;
  composerButtonBg?: string;
  /** Glyph colour inside those buttons. Falls through to `composerIcon`. */
  composerButtonFg?: string;
  /** The icon buttons' own box, as a CSS length. `auto` is the glyph plus padding. */
  composerButtonSize?: number | string;
  // ── Type scale and density ────────────────────────────────────────
  fontSizeSmall?: number | string;
  headingSize?: number | string;
  /** A unitless ratio as a STRING — `'1.4'` — or a length. */
  lineHeight?: string;
  density?: 'compact' | 'comfortable';
  // ── Launcher ──────────────────────────────────────────────────────
  launcherLabel?: string;
  launcherRadius?: number | string;
  /** The launcher's own background. Defaults to `primaryColor`. */
  launcherBg?: string;
  /** The launcher glyph's colour. Defaults to `primaryContrast`. */
  launcherFg?: string;
  /**
   * The launcher WHILE THE PANEL IS OPEN.
   *
   * Unset, that state inverts — panel background, `launcherBg` glyph. Set
   * these to keep the brand colour in both states, and set both: a
   * `launcherBg` glyph on a brand-coloured circle is usually invisible.
   */
  launcherOpenBg?: string;
  launcherOpenFg?: string;
  launcherSizeSm?: number;
  launcherLabelSize?: number | string;
}

/*
 * ── `ChatlyTheme` moved here from `types.ts` ────────────────────────────
 *
 * `types.ts` sat at 649 lines against a 650-line ceiling, so the two
 * composer-button fields the widget gained on 2026-10-21 could not be added
 * without a split — and `check-widget-wrapper-parity` fails if the wrapper
 * does not offer a field the widget honours, so "leave it out" was not an
 * option either.
 *
 * This is the seam the filename already implied: the THEME types live in
 * `types-theme.ts` and `types.ts` keeps the element's init options and
 * events. `ChatlyThemeOverlay` was already here, and having the overlay in
 * one file and the thing it overlays in another was the odd arrangement.
 */
/** Colours, shape, type and launcher art. Mirrors the widget's `WidgetTheme`. */
export interface ChatlyTheme {
  /*
   * Six names, and the sixth is the lesson.
   *
   * This read `'mic' | 'stop' | 'attachment' | 'check' | 'star'` — five — while
   * the runtime set (`WIDGET_ICON_NAMES` in
   * `@livechat/shared/widget-config/icons`) has six. `emoji` was missing, so a
   * TypeScript consumer of `<chatly-widget>` or `<ChatlyWidget />` could not
   * set that icon at all, while an untyped
   * `Chatly('init', { theme: { icons: { emoji: '\u{1F642}' } } })` worked. The
   * same gap was fixed in `@chatlychat/sdk-js` and this copy was not swept.
   *
   * `check-widget-wrapper-parity.mjs` cannot see it: it compares MEMBER NAMES
   * per interface and deliberately not types, so both sides said `icons` and
   * agreed. `icon-names-parity.spec.ts` beside this file is what holds the
   * union itself against the shared list.
   */
  icons?: Partial<Record<'attachment' | 'emoji' | 'mic' | 'stop' | 'check' | 'star', string>>;

  primaryColor?: string;
  primaryContrast?: string;
  background?: string;
  backgroundSubtle?: string;
  foreground?: string;
  foregroundMuted?: string;
  border?: string;
  bubbleAgentBg?: string;
  bubbleAgentFg?: string;

  fontFamily?: string;
  fontSize?: number | string;

  borderRadius?: number | string;
  launcherSize?: number;
  panelWidth?: number;
  panelHeight?: number;

  position?: 'left' | 'right';
  offsetX?: number;
  offsetY?: number;
  /** Panel bottom edge, measured up from `offsetY`. For a custom launcher. */
  panelOffsetY?: number;
  /**
   * A CSS selector for your own button; the panel sits above it and follows
   * it. Beats `panelOffsetY` while the element is there, falls back to the
   * corner when it is not. Free with `hideLauncher` and no `panelOffsetY`.
   */
  anchor?: string;

  headerStyle?: 'gradient' | 'solid' | 'plain' | 'light';
  headerGradient?: [string, string];

  hideLauncher?: boolean;
  launcherIcon?: string;
  launcherImage?: string;
  launcherPing?: boolean;
  launcherIdleAnimation?: 'none' | 'wiggle' | 'pulse' | 'bounce';

  colorScheme?: 'light' | 'dark' | 'auto';

  dangerColor?: string;
  successColor?: string;
  warningColor?: string;

  hideBranding?: boolean;

  logoUrl?: string;
  agentAvatarUrl?: string;

  // ── Cards (read by the deferred commerce chunk's stylesheet) ───────
  cardBg?: string;
  cardBorder?: string;
  cardRadius?: number | string;
  cardShadow?: string;
  /** `aspect-ratio` for the card image, e.g. `4 / 3`. */
  cardImageRatio?: string;
  cardImageFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  /** Title lines before clamping, as a STRING: `'2'`. See the SDK's note. */
  cardTitleLines?: string;
  cardPriceColor?: string;
  cardPriceSize?: number | string;
  cardBadgeBg?: string;
  cardBadgeFg?: string;
  cardButtonBg?: string;
  cardButtonBorder?: string;
  cardButtonFg?: string;
  // ── Quick-reply chips (same chunk) ─────────────────────────────────
  chipBg?: string;
  chipFg?: string;
  chipBorder?: string;
  chipRadius?: number | string;
  chipHoverBg?: string;
  chipWrap?: 'wrap' | 'nowrap';
  // ── Header geometry ───────────────────────────────────────────────
  headerHeight?: number | string;
  headerTitleSize?: number | string;
  headerSubtitleSize?: number | string;
  headerLogoOnly?: boolean;
  // ── Composer ──────────────────────────────────────────────────────
  composerBg?: string;
  composerBorder?: string;
  composerRadius?: number | string;
  composerPlaceholder?: string;
  composerIcon?: string;
  composerSendBg?: string;
  composerSendFg?: string;
  composerButtonBg?: string;
  /** Glyph colour inside those buttons. Falls through to `composerIcon`. */
  composerButtonFg?: string;
  /** The icon buttons' own box, as a CSS length. `auto` is the glyph plus padding. */
  composerButtonSize?: number | string;
  cardPerView?: string;
  // ── Type scale and density ────────────────────────────────────────
  fontSizeSmall?: number | string;
  headingSize?: number | string;
  /** A unitless ratio as a STRING — `'1.4'` — or a length. */
  lineHeight?: string;
  density?: 'compact' | 'comfortable';
  // ── Launcher ──────────────────────────────────────────────────────
  launcherLabel?: string;
  launcherRadius?: number | string;
  /** The launcher's own background. Defaults to `primaryColor`. */
  launcherBg?: string;
  /** The launcher glyph's colour. Defaults to `primaryContrast`. */
  launcherFg?: string;
  /**
   * The launcher WHILE THE PANEL IS OPEN.
   *
   * Unset, that state inverts — panel background, `launcherBg` glyph. Set
   * these to keep the brand colour in both states, and set both: a
   * `launcherBg` glyph on a brand-coloured circle is usually invisible.
   */
  launcherOpenBg?: string;
  launcherOpenFg?: string;
  launcherSizeSm?: number;
  launcherLabelSize?: number | string;
  // ── The two overlay palettes ──────────────────────────────────────
  darkTheme?: ChatlyThemeOverlay;
  inlineTheme?: ChatlyThemeOverlay;
}


/*
 * ═══ THE FOUR SHAPES BELOW MOVED HERE ON 2026-10-25 ═══════════════════════
 *
 * `ChatlyQuip`, `ChatlyBehavior`, `ChatlyQuickLink` and `ChatlyCopy` were in
 * `types.ts`, which crossed the 650-line ceiling again when the identity-loop
 * options (CHT-D10) were added.
 *
 * This is the seam the WIDGET SIDE already uses, which is what makes it the
 * right one rather than merely a convenient one: on the authoritative side
 * `WidgetTheme`, `WidgetBehavior`, `WidgetCopy`, `WidgetQuickLink` and
 * `WidgetQuip` all live together in `packages/sdk-js/src/widget-appearance.ts`.
 * The mirrors now sit in the same grouping as the things they mirror, so a
 * reader comparing the two files compares two files rather than four.
 *
 * It is also the one seam that needs no gate change.
 * `check-widget-wrapper-parity.mjs` reads `WRAPPER_TYPES` — `types.ts` AND
 * this file — and CONCATENATES them before extracting interfaces, so all four
 * pairs keep being compared across the move. That mattered: the header above
 * says this file is invisible to the gate, which was true when it held only
 * `ChatlyThemeOverlay` (a shape with no pair) and is no longer true of the
 * file as a whole. Four pairs in `PAIRS` now resolve here, with floors of 10,
 * 20, 5 and 4 behind them, so a future move that DID break the read would
 * report "nothing was verified" rather than passing.
 *
 * Re-exported from `types.ts`, so no consumer's import changed.
 */

/** Rotating micro-copy bound to a selector. Mirrors `WidgetQuip`. */
export interface ChatlyQuip {
  selector: string;
  lines: string[];
  intervalMs?: number;
  oncePerSession?: boolean;
}

/** Behaviour toggles. Mirrors the widget's `WidgetBehavior`. */
export interface ChatlyBehavior {
  tabs?: Array<'home' | 'messages' | 'help'>;
  defaultTab?: 'home' | 'messages' | 'help';
  autoOpenAfterMs?: number;
  hideOnUrls?: string[];
  helpSearchOnly?: boolean;
  starterPrompts?: string[];
  home?: Array<'start' | 'recent' | 'quickLinks' | 'blocks' | 'helpSearch'>;
  /**
   * A `{ v, blocks }` envelope, the same shape a message carries. `unknown`
   * rather than a block union: the widget validates it at the render boundary
   * precisely so a block type a newer release added does not blank the home
   * screen on an older bundle, and a narrow type here would refuse at compile
   * time the forward compatibility the runtime was built to allow.
   */
  homeBlocks?: unknown;
  draggable?: boolean;
  quips?: ChatlyQuip[];
  confettiClickStreak?: number;
}

/** A Home-tab button. Mirrors `WidgetQuickLink`. */
export interface ChatlyQuickLink {
  label: string;
  href?: string;
  startConversation?: string | { initialMessage?: string };
  description?: string;
  icon?: string;
}

/** Every string in the panel. Mirrors `WidgetCopy`. */
export interface ChatlyCopy {
  greeting?: string;
  greetingSubtitle?: string;
  homeStartCta?: string;
  homeStartCtaSubtitle?: string;
  homeRecentTitle?: string;
  homeQuickLinksTitle?: string;
  homeHelpTitle?: string;
  tabHome?: string;
  tabMessages?: string;
  tabHelp?: string;
  messagesEmpty?: string;
  messagesNewCta?: string;
  helpSearchPlaceholder?: string;
  helpEmpty?: string;
  helpNoResults?: string;
  helpStillNeedHelp?: string;
  composerPlaceholder?: string;
  composerSend?: string;
  poweredBy?: string;
  closeAria?: string;
  backAria?: string;
  unavailableMessage?: string;
  unavailableRetry?: string;
  /**
   * The expected-reply note in the header, shown only while somebody is
   * available to answer. Set it to your real figure, or to an empty string to
   * show nothing.
   *
   * It was a hardcoded sentence the widget showed regardless of staffing, so
   * an unstaffed workspace told every visitor it typically replies within a
   * few minutes.
   */
  responseTimeNote?: string;
}