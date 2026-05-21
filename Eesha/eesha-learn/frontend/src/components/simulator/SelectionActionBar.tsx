/**
 * SelectionActionBar
 *
 * Floating toolbar pinned to the top-center of the simulator canvas. Visible
 * whenever the user has something selected (wire / component / board). Gives
 * touch users a clear way to delete or rotate a selection without keyboard
 * shortcuts or right-click — the only way these actions were available before.
 *
 * Renders nothing when nothing is selected.
 *
 * Touch propagation note: the simulator canvas binds *native* touch listeners
 * with `addEventListener` and calls `preventDefault()` on touchend, which
 * suppresses the synthetic `click` event for buttons rendered above the
 * canvas. We therefore call `stopPropagation()` on the *native* touchstart
 * (React's synthetic stopPropagation does not affect native listeners) and
 * also wire each button to fire on `touchend` directly so taps work.
 */

import React, { useEffect, useRef } from 'react';

export type SelectionKind = 'wire' | 'component' | 'board';

interface SelectionActionBarProps {
  kind: SelectionKind | null;
  /** Human label, e.g. "Wire", "Arduino Uno", "LED" */
  label: string;
  /** Show the rotate button (components only). */
  canRotate?: boolean;
  onDelete: () => void;
  onRotate?: () => void;
  onDeselect: () => void;
}

const ICON_SIZE = 16;

const TrashIcon: React.FC = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const RotateIcon: React.FC = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Bind native touch listeners to a button so taps fire the action even when
 * the simulator canvas (with its own native `addEventListener('touchend')`
 * + preventDefault) would otherwise swallow the synthetic click.
 *
 * Strategy: stopPropagation on the native touchstart so the canvas listener
 * never sees the event, and call the handler directly on touchend. This
 * runs as a layout effect so the handler closure is current after every
 * render — no ref-during-render hacks needed.
 */
function useTouchSafeAction(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stopNative = (e: Event) => e.stopPropagation();
    const onTouchEndNative = (e: TouchEvent) => {
      e.stopPropagation();
      e.preventDefault();
      handler();
    };
    el.addEventListener('touchstart', stopNative, { passive: false });
    el.addEventListener('touchend', onTouchEndNative, { passive: false });
    return () => {
      el.removeEventListener('touchstart', stopNative);
      el.removeEventListener('touchend', onTouchEndNative);
    };
  }, [ref, handler]);
}

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({
  kind,
  label,
  canRotate,
  onDelete,
  onRotate,
  onDeselect,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const rotateRef = useRef<HTMLButtonElement | null>(null);
  const deselectRef = useRef<HTMLButtonElement | null>(null);

  // Stop native touch events from reaching the canvas listener so it can't
  // call preventDefault on touchend (which would kill the synthetic click).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    el.addEventListener('touchend', stop, { passive: false });
    el.addEventListener('mousedown', stop);
    return () => {
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('touchmove', stop);
      el.removeEventListener('touchend', stop);
      el.removeEventListener('mousedown', stop);
    };
  }, [kind]);

  useTouchSafeAction(deleteRef, onDelete);
  useTouchSafeAction(rotateRef, onRotate ?? noop);
  useTouchSafeAction(deselectRef, onDeselect);

  if (!kind) return null;

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Selection actions"
      className="selection-action-bar"
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#252526',
        border: '1px solid #3c3c3c',
        borderRadius: 8,
        padding: '6px 8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        zIndex: 50,
        fontSize: 13,
        color: '#e0e0e0',
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
    >
      <span
        style={{
          padding: '0 8px 0 4px',
          color: '#bbb',
          maxWidth: 180,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>

      {canRotate && onRotate && (
        <button
          type="button"
          ref={rotateRef}
          onClick={onRotate}
          style={buttonStyle}
          title="Rotate 90°"
          aria-label="Rotate"
        >
          <RotateIcon />
          <span className="selection-action-bar__label" style={buttonLabelStyle}>
            Rotate
          </span>
        </button>
      )}

      <button
        type="button"
        ref={deleteRef}
        onClick={onDelete}
        style={{ ...buttonStyle, color: '#e06c75' }}
        title={`Delete ${kind}`}
        aria-label={`Delete ${kind}`}
      >
        <TrashIcon />
        <span className="selection-action-bar__label" style={buttonLabelStyle}>
          Delete
        </span>
      </button>

      <button
        type="button"
        ref={deselectRef}
        onClick={onDeselect}
        style={{ ...buttonStyle, padding: '6px 8px' }}
        title="Deselect"
        aria-label="Deselect"
      >
        <CloseIcon />
      </button>
    </div>
  );
};

const noop = () => {};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 6,
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
  minHeight: 36, // touch-friendly hit target
};

const buttonLabelStyle: React.CSSProperties = {
  // Hidden on very narrow toolbars; kept visible by default for clarity
};
