// SPDX-License-Identifier: MPL-2.0
// One action button. Destructive actions (`destructive`) arm on a first activation (click, Enter
// or Space) and only fire on a second activation within five seconds -- "Enter twice", the way
// issue 100's keyboard rule reads literally, since a native `<button>` already treats Enter and
// Space as a click. Armed state is announced (`aria-pressed`, a changed label) so a screen reader
// user hears the change, not just sees it.
import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  armedLabel?: string;
  destructive?: boolean;
  disabled?: boolean;
  title?: string;
  onRun: () => void;
}

export function ActionButton({ label, armedLabel, destructive, disabled, title, onRun }: Props) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const activate = () => {
    if (disabled) return;
    if (!destructive) {
      onRun();
      return;
    }
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 5000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
    onRun();
  };

  return (
    <button
      type="button"
      className={`action-button${armed ? ' action-button--armed' : ''}`}
      aria-pressed={destructive ? armed : undefined}
      disabled={disabled}
      title={title}
      onClick={activate}
    >
      {armed ? (armedLabel ?? `Confirm: ${label}`) : label}
    </button>
  );
}
