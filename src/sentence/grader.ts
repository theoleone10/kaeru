import { Platform } from 'react-native';
import { precheck, normalizeSentence } from './precheck';
import type { Verdict } from './repo';

export interface GradeResult {
  verdict: Verdict;
  /** A precheck key or a model error type; null when correct or unsure. */
  errorType: string | null;
  modelVersion: string;
  /** The sentence as it was graded (normalized). */
  sentence: string;
}

export interface Grader {
  grade(pointId: string, text: string): Promise<GradeResult>;
}

export interface Thresholds {
  accept: number;
  reject: number;
}

/** Turn the model's probability into a verdict using the manifest thresholds. */
export function calibrate(p: number, errLogits: readonly number[], errorTypes: readonly string[], t: Thresholds): { verdict: Verdict; errorType: string | null } {
  if (p >= t.accept) return { verdict: 'correct', errorType: null };
  if (p <= t.reject) {
    let best = 0;
    for (let i = 1; i < errLogits.length; i++) if (errLogits[i] > errLogits[best]) best = i;
    return { verdict: 'incorrect', errorType: errorTypes[best] ?? 'ungrammatical' };
  }
  return { verdict: 'unsure', errorType: null };
}

/**
 * Development grader: only the instant checks, so the flow can be built and tried in
 * Expo Go or on Android before the on-device model exists. Never used in release builds.
 */
export const devGrader: Grader = {
  async grade(pointId, text) {
    const sentence = normalizeSentence(text);
    const problem = precheck(pointId, sentence);
    if (problem) return { verdict: 'incorrect', errorType: problem, modelVersion: 'precheck', sentence };
    return { verdict: 'correct', errorType: null, modelVersion: 'dev', sentence };
  },
};

/**
 * Whether this build can check sentences at all. The on-device model (modules/kaeru-grader)
 * isn't built yet, so only development builds offer the feature, using the dev grader.
 */
export function graderAvailable(): boolean {
  return __DEV__ && Platform.OS !== 'web';
}

export function sentencePracticeOn(settings: { sentencePracticeEnabled: boolean }): boolean {
  return graderAvailable() && settings.sentencePracticeEnabled;
}

export function getGrader(): Grader {
  return devGrader;
}
