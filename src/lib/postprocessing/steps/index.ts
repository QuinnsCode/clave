// src/lib/postprocessing/steps/index.ts
//
// Step registry. The harness looks up steps by name here. Each step file
// declares its own dependsOn, defaultOpts, and run() — this file just lists.

import type { Step, StepName } from "../types";

import { assembleStep } from "./assemble";
import { waveformStep } from "./waveform";
import { diarizeStep  } from "./diarize";
import { cleanupStep  } from "./cleanup";   // NEW (cleanup pass)
import { timelineStep } from "./timeline";

export const STEPS: Record<StepName, Step<any>> = {
  assemble: assembleStep,
  waveform: waveformStep,
  diarize:  diarizeStep,
  cleanup:  cleanupStep,   // NEW
  timeline: timelineStep,
};

export function getStep<K extends StepName>(name: K): Step<any> {
  const step = STEPS[name];
  if (!step) throw new Error(`unknown step: ${name}`);
  return step;
}