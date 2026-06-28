/**
 * Reusable visual primitives for Kingdoms of Dominion (UI refactor backlog
 * ticket #15, with #12-14 as candidates for the same treatment once there's
 * budget to migrate every call site). Start here instead of hand-rolling
 * another inline-styled `<span>` chip — that's exactly how the same pattern
 * ended up duplicated five times across ActionPanel.tsx before this existed.
 */

import { useEffect } from 'react';
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

export interface BadgeProps {
  children: ReactNode;
  /** CSS color value (hex or var()) used for the border/text tint. Omit for neutral. */
  color?: string;
  /** Tints red and overrides `color` — used for "can't afford this" / blocking states. */
  short?: boolean;
  title?: string;
}

/** Pill-shaped badge — costs, counts, stat chips, and deltas all render from this. */
export function Badge({ children, color, short, title }: BadgeProps): JSX.Element {
  return (
    <span
      className={`k-badge${short ? ' k-badge--short' : ''}`}
      style={color && !short ? ({ '--badge-color': color } as CSSProperties) : undefined}
      title={title}
    >
      {children}
    </span>
  );
}

/**
 * The action-panel card shell (ticket #13). Was re-typed as a literal
 * `<div className="k-action-panel">` in five separate places in
 * ActionPanel.tsx — one per interaction mode — since each mode does an early
 * return with its own JSX tree.
 */
export function Panel({ children }: { children: ReactNode }): JSX.Element {
  return <div className="k-action-panel">{children}</div>;
}

/**
 * Uppercase section label used to introduce a group of actions/info inside a
 * Panel (ticket #13) — "selected tile", "combat", "recruit", etc. Was a
 * hand-typed `<div className="k-action-panel__section-label">` repeated nine
 * times before this existed.
 */
export function SectionHeader({ children }: { children: ReactNode }): JSX.Element {
  return <div className="k-action-panel__section-label">{children}</div>;
}

/**
 * Disclosure tooltip (ticket #14). Was `InfoTooltip` inside ActionPanel.tsx,
 * hardcoded to a single {label, desc, stats} shape — generalized to take
 * arbitrary children so it's reusable anywhere a piece, button, or stat
 * needs an expandable explanation. Button-triggered (not CSS :hover), so it
 * already gets keyboard focus + Enter/Space activation for free from
 * whatever <Button> opens it — no separate a11y wiring needed.
 */
export function Tooltip({ children }: { children: ReactNode }): JSX.Element {
  return <div className="k-info-tooltip">{children}</div>;
}

export type ButtonVariant = 'solid' | 'ghost' | 'danger' | 'blue';

const BUTTON_VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  solid: 'btn',
  ghost: 'btn btn--ghost',
  danger: 'btn--danger',
  blue: 'btn--blue',
};

export interface ButtonProps {
  children: ReactNode;
  /** @default 'solid' */
  variant?: ButtonVariant;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
  className?: string;
  /** For icon-only buttons (e.g. "−"/"+" steppers) where the visible text doesn't say what it does (ticket #45). */
  ariaLabel?: string;
}

/**
 * Action button (ticket #12). Wraps the four `.btn*` variant classes that
 * were previously typed out by hand at every call site — solid (default
 * action), ghost (cancel/secondary), danger (attack/destructive), blue (move).
 */
export function Button({ children, variant = 'solid', onClick, disabled, style, title, className, ariaLabel }: ButtonProps): JSX.Element {
  const classes = className ? `${BUTTON_VARIANT_CLASS[variant]} ${className}` : BUTTON_VARIANT_CLASS[variant];
  return (
    <button className={classes} onClick={onClick} disabled={disabled} style={style} title={title} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Native `<details>`-backed collapsed section (tickets #27, #31). Recruit
 * and Build used to render their full item list inline unconditionally,
 * which was the single biggest contributor to the side panel's "long scroll
 * with no priority" problem (#27) — collapsing them by default means tile
 * identity + the primary action are visible without scrolling. Also backs
 * the Event Log (#31). `<details>` gets keyboard toggling and focus for
 * free — no custom JS state or ARIA wiring needed.
 */
export function CollapsibleSection({ title, count, defaultOpen, className, children }: CollapsibleSectionProps): JSX.Element {
  const classes = className ? `k-collapsible ${className}` : 'k-collapsible';
  return (
    <details className={classes} open={defaultOpen}>
      <summary className="k-collapsible__summary">{title}{count !== undefined ? ` (${count})` : ''}</summary>
      <div className="k-collapsible__body">{children}</div>
    </details>
  );
}

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Backs the rules reference (#42) and settings panel (#43) — both needed
 * the same dismissible-overlay shell, so it's a primitive instead of two
 * near-duplicate implementations. Escape-to-close and `role="dialog"` are
 * built in rather than left for the Phase 6 a11y pass (#45) to bolt on later.
 */
export function Modal({ title, onClose, children }: ModalProps): JSX.Element {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="k-modal-backdrop" onClick={onClose}>
      <div
        className="k-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="k-modal__header">
          <span className="k-modal__title">{title}</span>
          <button className="k-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="k-modal__body">{children}</div>
      </div>
    </div>
  );
}
