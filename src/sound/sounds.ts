import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const SOURCES = {
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  complete: require('../../assets/sounds/complete.wav'),
  tap: require('../../assets/sounds/tap.wav'),
  start: require('../../assets/sounds/start.wav'),
  stop: require('../../assets/sounds/stop.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

let enabled = true;
let configured = false;
const players = new Map<SoundName, AudioPlayer>();

/** Mirrors the "Sound effects" setting (set by AppProvider). */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

function player(name: SoundName): AudioPlayer {
  let p = players.get(name);
  if (!p) {
    p = createAudioPlayer(SOURCES[name]);
    players.set(name, p);
  }
  return p;
}

/**
 * Play a short effect. Mixes with whatever else is playing (your podcast or anime keeps
 * going) and stays quiet when the phone's silent switch is on. Never throws.
 */
export function playSound(name: SoundName): void {
  if (!enabled) return;
  try {
    if (!configured) {
      configured = true;
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => undefined);
    }
    const p = player(name);
    p.seekTo(0).catch(() => undefined);
    p.play();
  } catch {
    // Sound is decoration: ignore failures (e.g. no audio output).
  }
}
