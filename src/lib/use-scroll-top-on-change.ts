"use client";

import { useEffect, type RefObject } from "react";

// Scrolls back to the top whenever `dependency` changes — used everywhere
// the app switches "onglet" or view without a real URL navigation
// (AdminSidebar's sections, a coach's multi-team switcher, a modal's own
// tab bar...), so a scroll position left over from the previous view
// never carries into the next one. Resets both the page-level scroll
// (window/document, covering the common case where the tab content is
// just part of the normal page flow) and, when the tab's content lives
// inside its own scrollable panel instead (e.g. a modal body with
// overflow-y-auto), that container too via `containerRef`.
export function useScrollTopOnChange(
  dependency: unknown,
  containerRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    containerRef?.current?.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependency]);
}
