// Groundwork for a future AI connection. Nothing in the app calls an AI service today, and no
// button in the interface claims that it does.
//
// Rules for whoever connects a real provider later:
// - Never put an API key in this browser app. Calls must go through a small server you control
//   (for example a serverless function) that keeps the key secret.
// - The AI may only suggest. Every measurement it proposes must be shown to the user as a
//   suggestion, marked as unverified, and must never replace a value the user typed or leave a
//   missing value silently filled in.
// - Geometry (projections, sections, areas) is always computed by src/geometry, never by the AI.

import type { DrawingElement, SpacePoint } from './types';

export interface AiSuggestion<T> {
  value: T;
  /** Plain-language explanation shown to the user next to the suggestion. */
  explanation: string;
  /** Always true for AI output: the user has to check and accept it. */
  needsReview: true;
}

export interface AiProvider {
  /** True only when a real, configured connection exists. */
  readonly available: boolean;
  /** Human-readable name shown in settings, e.g. "not connected". */
  readonly label: string;
  /** Read point names and coordinates from an exercise image. Missing values must stay null. */
  readPointsFromImage?(imageDataUrl: string): Promise<AiSuggestion<SpacePoint[]>>;
  /** Suggest drawing elements traced from an image. */
  traceImage?(imageDataUrl: string): Promise<AiSuggestion<DrawingElement[]>>;
}

/** The provider used today: no AI is connected, so nothing is offered. */
export const noAiProvider: AiProvider = {
  available: false,
  label: 'לא מחובר',
};

export function getAiProvider(): AiProvider {
  return noAiProvider;
}
