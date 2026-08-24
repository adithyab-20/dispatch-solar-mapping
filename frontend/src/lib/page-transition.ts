export type PageTransitionDirection = "forward" | "back";

interface BrowserViewTransition {
  finished: Promise<unknown>;
  ready?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
}

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => BrowserViewTransition;
};

/**
 * Runs a route update inside the browser View Transition API. The update must
 * remain synchronous: animation frames are paused while the browser captures
 * the new state, so awaiting one here would make the transition time out.
 * Unsupported/reduced-motion browsers navigate immediately.
 */
export function startPageTransition(
  direction: PageTransitionDirection,
  update: () => void = () => {},
): void {
  const doc = document as TransitionDocument;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  if (!doc.startViewTransition || reducedMotion) {
    update();
    return;
  }

  document.documentElement.dataset.pageTransition = direction;
  const transition = doc.startViewTransition(update);
  const clearDirection = () => {
    if (document.documentElement.dataset.pageTransition === direction) {
      delete document.documentElement.dataset.pageTransition;
    }
  };
  // A transition may be skipped/cancelled by the browser (for example when a
  // second navigation starts). Every promise exposed by the API can reject;
  // observe all of them so cancellation never becomes an unhandled rejection.
  for (const result of [transition.ready, transition.updateCallbackDone]) {
    if (result) void result.then(undefined, () => {});
  }
  void transition.finished.then(clearDirection, clearDirection);
}
