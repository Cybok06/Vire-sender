const NOTIFICATION_SOUND_URL = new URL('../sounds/notification.mp3', import.meta.url).href;
const MIN_PLAY_INTERVAL_MS = 1200;

let audio: HTMLAudioElement | null = null;
let lastPlayedAt = 0;

function getAudio() {
  if (!audio) {
    audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.preload = 'auto';
    audio.volume = 0.75;
  }
  return audio;
}

export function playNotificationSound() {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastPlayedAt < MIN_PLAY_INTERVAL_MS) return;
  lastPlayedAt = now;

  try {
    const player = getAudio();
    player.pause();
    player.currentTime = 0;
    const playResult = player.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => {});
    }
  } catch {
    // Browsers may block autoplay until user interaction; ignore quietly.
  }
}
