// src/lib/pods/naming.ts
//
// Pod display-name generator. Wraps `unique-names-generator` to produce
// short, friendly, neutral names like "Brave Crimson Pod" / "Quiet Cobalt Pod".

import {
    uniqueNamesGenerator,
    adjectives,
    colors,
  } from "unique-names-generator";
  
  // Filter colors that read as skin tones.
  const SKIN_TONE_COLORS = new Set([
    "beige", "tan", "peach", "ivory", "bronze", "umber", "almond",
    "fawn", "champagne", "buff", "wheat",
  ]);
  
  const safeColors = colors.filter(c => !SKIN_TONE_COLORS.has(c.toLowerCase()));
  
  export function generatePodName(): string {
    const raw = uniqueNamesGenerator({
      dictionaries: [adjectives, safeColors],
      separator:    " ",
      style:        "capital",
      length:       2,
    });
    return `${raw} Pod`;
  }
  
  export function podSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }