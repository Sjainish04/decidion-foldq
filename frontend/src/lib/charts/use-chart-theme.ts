"use client";

import { useSyncExternalStore } from "react";
import { DARK_CHROME, LIGHT_CHROME, type ChartChrome } from "./theme";

/** Whether the dark theme is active, as a subscribable external store.
 *
 *  Charts render to a canvas and cannot use CSS variables, so unlike the rest of
 *  the UI they do not follow the theme for free — the colours have to be passed
 *  in as literals and the chart re-rendered when the theme changes. The toggle
 *  stamps a `dark` class on <html>, so a MutationObserver on that attribute is
 *  the signal.
 *
 *  `useSyncExternalStore` rather than `useState` + effect: it reads the value
 *  during render on the client and takes an explicit server snapshot, so there
 *  is no first paint with the wrong palette and no hydration mismatch.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

// The server has no DOM and cannot know the reader's theme. Light is the
// project's default, and the observer corrects it on the client before paint.
const serverSnapshot = () => false;

export function useChartTheme(): ChartChrome {
  const dark = useSyncExternalStore(subscribe, isDark, serverSnapshot);
  return dark ? DARK_CHROME : LIGHT_CHROME;
}
