// src/app/hooks/qollab/useColorPicker.ts
// Headless color picker hook — no styles, composable anywhere.

import { useState, useCallback, useRef, useEffect } from "react";

export interface UseColorPickerOptions {
  initial?:  string;   // hex
  presets?:  string[]; // hex array
  onChange?: (hex: string) => void;
}

export interface UseColorPickerReturn {
  color:        string;       // current hex
  isOpen:       boolean;
  hue:          number;       // 0-360
  saturation:   number;       // 0-100
  lightness:    number;       // 0-100
  alpha:        number;       // 0-100
  inputValue:   string;       // raw hex input string
  presets:      string[];

  // Actions
  open:         () => void;
  close:        () => void;
  toggle:       () => void;
  setColor:     (hex: string) => void;
  setHue:       (h: number) => void;
  setSaturation:(s: number) => void;
  setLightness: (l: number) => void;
  setAlpha:     (a: number) => void;
  setInputValue:(v: string) => void;
  commitInput:  () => void;    // parse inputValue → color

  // Refs for click-outside
  triggerRef:   React.RefObject<HTMLElement>;
  popoverRef:   React.RefObject<HTMLElement>;
}

// ── Color math ────────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l   = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const hn = h / 360, sn = s / 100, ln = l / 100;
  let r, g, b;

  if (sn === 0) {
    r = g = b = ln;
  } else {
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1/3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1/3);
  }

  return `#${Math.round(r*255).toString(16).padStart(2,"0")}${Math.round(g*255).toString(16).padStart(2,"0")}${Math.round(b*255).toString(16).padStart(2,"0")}`;
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export const DEFAULT_PRESETS = [
  "#ffffff", "#ece8f8", "#a78bfa", "#7c3aed",
  "#22c55e", "#fbbf24", "#f87171", "#60a5fa",
  "#f472b6", "#34d399", "#fb923c", "#000000",
];

export function useColorPicker({
  initial  = "#a78bfa",
  presets  = DEFAULT_PRESETS,
  onChange,
}: UseColorPickerOptions = {}): UseColorPickerReturn {

  const [color,      setColorState] = useState(initial);
  const [isOpen,     setIsOpen]     = useState(false);
  const [alpha,      setAlphaState] = useState(100);
  const [inputValue, setInputValue] = useState(initial);

  const [hue, saturation, lightness] = hexToHsl(color);

  const triggerRef = useRef<HTMLElement>("");
  const popoverRef = useRef<HTMLElement>("");

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      const t = triggerRef.current;
      const p = popoverRef.current;
      if (!t || !p) return;
      if (!t.contains(e.target as Node) && !p.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const applyColor = useCallback((hex: string) => {
    setColorState(hex);
    setInputValue(hex);
    onChange?.(hex);
  }, [onChange]);

  const setColor = useCallback((hex: string) => {
    if (!isValidHex(hex)) return;
    applyColor(hex);
  }, [applyColor]);

  const setHue = useCallback((h: number) => {
    const [, s, l] = hexToHsl(color);
    applyColor(hslToHex(h, s, l));
  }, [color, applyColor]);

  const setSaturation = useCallback((s: number) => {
    const [h, , l] = hexToHsl(color);
    applyColor(hslToHex(h, s, l));
  }, [color, applyColor]);

  const setLightness = useCallback((l: number) => {
    const [h, s] = hexToHsl(color);
    applyColor(hslToHex(h, s, l));
  }, [color, applyColor]);

  const setAlpha = useCallback((a: number) => {
    setAlphaState(Math.max(0, Math.min(100, a)));
    onChange?.(color);
  }, [color, onChange]);

  const commitInput = useCallback(() => {
    const hex = inputValue.startsWith("#") ? inputValue : `#${inputValue}`;
    if (isValidHex(hex)) applyColor(hex);
    else setInputValue(color); // revert
  }, [inputValue, color, applyColor]);

  const open   = useCallback(() => setIsOpen(true),  []);
  const close  = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(v => !v), []);

  return {
    color, isOpen,
    hue, saturation, lightness, alpha,
    inputValue, presets,
    open, close, toggle,
    setColor, setHue, setSaturation, setLightness, setAlpha,
    setInputValue, commitInput,
    triggerRef, popoverRef,
  };
}