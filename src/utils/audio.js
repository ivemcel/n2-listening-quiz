/**
 * Create an Audio element for a segment of a larger audio file.
 * Returns the audio element (not yet playing).
 */
export function createSegmentAudio(audioSrc, startTime, endTime) {
  const audio = new Audio(audioSrc);
  audio.currentTime = startTime;

  if (endTime) {
    const checkEnd = () => {
      if (audio.currentTime >= endTime) {
        audio.pause();
        audio.currentTime = startTime;
        audio.removeEventListener('timeupdate', checkEnd);
      }
    };
    audio.addEventListener('timeupdate', checkEnd);
  }

  return audio;
}

/**
 * Format seconds to mm:ss
 */
export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parse a timestamp string like "1:23" or "45" into seconds
 */
export function parseTimestamp(str) {
  str = str.trim();
  if (str.includes(':')) {
    const [min, sec] = str.split(':').map(Number);
    return min * 60 + (sec || 0);
  }
  return parseFloat(str) || 0;
}
