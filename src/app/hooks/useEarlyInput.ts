// src/app/hooks/useEarlyInput.ts
"use client";
// Text typed into a server-rendered input before React hydrates lives only in
// the DOM; React state still holds the initial value, so the text is lost and
// anything gated on it (a Join button) stays disabled. React also clears a
// *controlled* input while hydrating, so pair this with an uncontrolled input
// (defaultValue + onChange): on mount, the DOM's value is adopted into state.

import { useLayoutEffect, useRef } from "react";

export function useEarlyInput(current: string, set: (v: string) => void) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const v = ref.current?.value;
    if (v != null && v !== current) set(v);
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
