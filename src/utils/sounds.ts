import { isSoundEffectsEnabled } from './speech';

const SOUND_URLS = {
  cardSwipe: "/sound/card-swipe.mp3",
  mastered: "/sound/mastered.mp3",
  toughNut: "/sound/tough-nut.mp3",
  cardFlip: "/sound/card-flip.mp3",
} as const;

export type SoundName = keyof typeof SOUND_URLS;

const cache = new Map<SoundName, HTMLAudioElement>();

function getAudio(name: SoundName): HTMLAudioElement {
  let audio = cache.get(name);
  if (!audio) {
    audio = new Audio(SOUND_URLS[name]);
    cache.set(name, audio);
  }
  return audio;
}

/** Play a short UI sound effect from `public/sound/`. */
export function playSound(name: SoundName) {
  if (!isSoundEffectsEnabled()) return;

  try {
    const audio = getAudio(name);
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Audio unsupported or blocked — fail silently.
  }
}
