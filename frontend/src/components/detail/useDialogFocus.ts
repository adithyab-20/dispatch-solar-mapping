"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Keep modal keyboard focus contained and return it to the opening control. */
export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  dismissible = true,
): RefObject<HTMLElement | null> {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    closeRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [dismissible, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () =>
      dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];

    (focusable()[0] ?? dialog)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissibleRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (controls.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  return dialogRef;
}
