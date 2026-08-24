"use client";

import type { ComponentProps, MouseEvent } from "react";
import Link from "next/link";

import { startPageTransition, type PageTransitionDirection } from "@/lib/page-transition";

type TransitionLinkProps = ComponentProps<typeof Link> & {
  direction: PageTransitionDirection;
};

/** A Next link that lets normal client navigation occur inside a page transition. */
export function TransitionLink({ direction, onClick, target, ...props }: TransitionLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target !== undefined && target !== "_self")
    ) {
      return;
    }

    // Next's Link performs its router update immediately after this handler.
    // The transition callback waits through that commit before taking the new
    // page snapshot, while the Link retains all native routing semantics.
    startPageTransition(direction);
  };

  return <Link {...props} target={target} onClick={handleClick} />;
}
