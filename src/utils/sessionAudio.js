import sessionStartsRaw from '../../data/session_starts.txt?raw';

const sessionAudioFiles = import.meta.glob('../../data/sessions/*.wav', {
  eager: true,
  query: '?url',
  import: 'default',
});

function parseClockTime(value) {
  const parts = value.split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [hours, minutes, seconds] = parts;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseSessionStarts(raw) {
  return Object.fromEntries(
    raw
      .trim()
      .split(/\n+/)
      .map(line => line.trim().split(/\s+/))
      .map(([sessionId, clockTime]) => [sessionId, parseClockTime(clockTime)])
      .filter(([, seconds]) => seconds !== null)
  );
}

const sessionStarts = parseSessionStarts(sessionStartsRaw);

export function getSessionAudioSrc(sessionId) {
  return sessionAudioFiles[`../../data/sessions/${sessionId}.wav`] || null;
}

export function toSessionRelativeTimestamp(sessionId, timestamp) {
  if (!timestamp) return null;

  const sessionStart = sessionStarts[sessionId];
  if (sessionStart === undefined) return timestamp;

  return {
    start: Math.max(0, timestamp.start - sessionStart),
    end: timestamp.end == null ? null : Math.max(0, timestamp.end - sessionStart),
  };
}
