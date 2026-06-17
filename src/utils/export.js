/**
 * Utilities for exporting wrong-answer audio data.
 *
 * The actual audio extraction is done via a Node.js script (scripts/export-wrong-audio.mjs)
 * using ffmpeg. This file handles the browser-side data preparation.
 */

/**
 * Save export metadata to localStorage for the Node script to read.
 */
export function saveExportData(wrongBook, questionMap, timestampsData) {
  const entries = wrongBook.map(id => {
    const entry = questionMap[id];
    if (!entry) return null;
    const ts = timestampsData[entry.sessionId]?.[entry.question.number];
    return {
      id,
      sessionId: entry.sessionId,
      year: entry.year,
      month: entry.month,
      number: entry.question.number,
      japanese: entry.question.dialogue.japanese,
      start: ts?.start ?? 0,
      end: ts?.end ?? 0,
    };
  }).filter(Boolean);

  const data = {
    entries,
    exportedAt: new Date().toISOString(),
  };

  localStorage.setItem('n2-export-data', JSON.stringify(data));
  return data;
}

/**
 * Load export data from localStorage
 */
export function loadExportData() {
  const raw = localStorage.getItem('n2-export-data');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
