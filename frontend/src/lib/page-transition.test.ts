import { afterEach, describe, expect, it, vi } from "vitest";

import { startPageTransition } from "@/lib/page-transition";

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  delete document.documentElement.dataset.pageTransition;
});

describe("startPageTransition", () => {
  it("runs the route update synchronously and observes every transition promise", () => {
    const readyThen = vi.fn();
    const updateDoneThen = vi.fn();
    const finishedThen = vi.fn();
    const update = vi.fn();

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: vi.fn((callback: () => void) => {
        callback();
        return {
          ready: { then: readyThen },
          updateCallbackDone: { then: updateDoneThen },
          finished: { then: finishedThen },
        };
      }),
    });

    startPageTransition("forward", update);

    expect(update).toHaveBeenCalledOnce();
    expect(readyThen).toHaveBeenCalledOnce();
    expect(updateDoneThen).toHaveBeenCalledOnce();
    expect(finishedThen).toHaveBeenCalledOnce();
    expect(document.documentElement).toHaveAttribute("data-page-transition", "forward");

    const finishOnRejected = finishedThen.mock.calls[0]?.[1] as (() => void) | undefined;
    finishOnRejected?.();
    expect(document.documentElement).not.toHaveAttribute("data-page-transition");
  });
});
