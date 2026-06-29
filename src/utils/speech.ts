/**
 * Speak a word clearly using the browser's SpeechSynthesis API.
 */
export function speakWord(text: string) {
  if ('speechSynthesis' in window) {
    // Cancel any ongoing speech first
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Choose a suitable voice
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.includes('en-US')) ||
                    voices.find(v => v.lang.startsWith('en-')) ||
                    voices[0];

    if (enVoice) {
      utterance.voice = enVoice;
    }

    utterance.rate = 0.85; // Slightly slower for clear pronounciation
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
  } else {
    console.warn('Speech synthesis not supported in this browser.');
  }
}

export function isSoundEffectsEnabled(): boolean {
  const setting = localStorage.getItem('instagre_sound_enabled');
  return setting === null ? true : setting === 'true';
}

export function setSoundEffectsEnabled(enabled: boolean): void {
  localStorage.setItem('instagre_sound_enabled', enabled ? 'true' : 'false');
}

// Pre-trigger voice loading (browsers load voices asynchronously)
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
}
