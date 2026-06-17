/**
 * Browser-side audio extraction, concatenation, and download.
 * Uses Web Audio API — no ffmpeg required.
 */

/**
 * Convert an AudioBuffer to a WAV Blob.
 */
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;
  const dataLength = buffer.length * numChannels * (bitsPerSample / 8);
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // byte rate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // block align
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = buffer.getChannelData(ch)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Extract a segment [startSeconds, endSeconds] from an AudioBuffer.
 */
function extractSegment(buffer, startSeconds, endSeconds) {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(startSeconds * sampleRate);
  const endSample = Math.min(Math.floor(endSeconds * sampleRate), buffer.length);
  const length = endSample - startSample;

  if (length <= 0) return null;

  const ctx = new OfflineAudioContext(
    buffer.numberOfChannels,
    length,
    sampleRate
  );

  const source = ctx.createBufferSource();
  const segmentBuffer = ctx.createBuffer(
    buffer.numberOfChannels,
    length,
    sampleRate
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    segmentBuffer.copyToChannel(
      buffer.getChannelData(ch).subarray(startSample, endSample),
      ch
    );
  }

  source.buffer = segmentBuffer;
  source.connect(ctx.destination);
  source.start(0);

  return ctx.startRendering();
}

/**
 * Concatenate multiple AudioBuffers into one.
 */
async function concatBuffers(buffers) {
  if (buffers.length === 0) return null;
  if (buffers.length === 1) return buffers[0];

  const sampleRate = buffers[0].sampleRate;
  const numChannels = Math.max(...buffers.map(b => b.numberOfChannels));
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);

  const ctx = new OfflineAudioContext(numChannels, totalLength, sampleRate);
  let offset = 0;

  for (const buffer of buffers) {
    const source = ctx.createBufferSource();
    // Resample/channel-convert if needed
    if (buffer.sampleRate !== sampleRate || buffer.numberOfChannels !== numChannels) {
      const resampled = ctx.createBuffer(numChannels, buffer.length, sampleRate);
      for (let ch = 0; ch < Math.min(numChannels, buffer.numberOfChannels); ch++) {
        resampled.copyToChannel(buffer.getChannelData(ch), ch);
      }
      source.buffer = resampled;
    } else {
      source.buffer = buffer;
    }
    source.connect(ctx.destination);
    source.start(0, 0, buffer.duration);
    // We must schedule sequentially for OfflineAudioContext
    // Instead, use a single buffer approach
    offset += buffer.length;
  }

  // OfflineAudioContext with multiple sources is tricky for sequential playback.
  // Use manual buffer concatenation instead:
  const result = ctx.createBuffer(numChannels, totalLength, sampleRate);
  let writeOffset = 0;

  for (const buffer of buffers) {
    for (let ch = 0; ch < numChannels; ch++) {
      const srcData = ch < buffer.numberOfChannels
        ? buffer.getChannelData(ch)
        : new Float32Array(buffer.length);
      result.getChannelData(ch).set(srcData, writeOffset);
    }
    writeOffset += buffer.length;
  }

  return result;
}

/**
 * Fetch and decode an audio file as AudioBuffer.
 */
async function fetchAudioBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  const audioCtx = new AudioContext();
  const buffer = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();
  return buffer;
}

/**
 * Main export function: download wrong-answer audio.
 *
 * @param {Array} entries - Array of { id, sessionId, number, start, end }
 * @param {Object} sessionAudioMap - { sessionId: audioUrl }
 */
export async function downloadWrongAudio(entries, sessionAudioMap) {
  // Group entries by session to avoid re-fetching the same file
  const bySession = {};
  for (const entry of entries) {
    const sid = entry.sessionId;
    if (!bySession[sid]) bySession[sid] = [];
    bySession[sid].push(entry);
  }

  // Fetch and extract segments
  const allSegments = [];

  for (const [sessionId, sessionEntries] of Object.entries(bySession)) {
    const audioUrl = sessionAudioMap[sessionId];
    if (!audioUrl) {
      console.warn(`No audio file for session: ${sessionId}`);
      continue;
    }

    let buffer;
    try {
      buffer = await fetchAudioBuffer(audioUrl);
    } catch (err) {
      console.error(`Failed to load audio for ${sessionId}:`, err);
      continue;
    }

    for (const entry of sessionEntries) {
      if (entry.start == null || entry.end == null || entry.end <= entry.start) {
        console.warn(`Invalid timestamps for ${entry.id}`);
        continue;
      }
      try {
        const segment = await extractSegment(buffer, entry.start, entry.end);
        if (segment) {
          allSegments.push({ id: entry.id, buffer: segment });
        }
      } catch (err) {
        console.error(`Failed to extract segment for ${entry.id}:`, err);
      }
    }
  }

  if (allSegments.length === 0) {
    throw new Error('没有可导出的音频段');
  }

  // Concatenate all segments
  const buffers = allSegments.map(s => s.buffer);
  const concatenated = await concatBuffers(buffers);

  // Convert to WAV and download
  const wavBlob = audioBufferToWav(concatenated);
  const url = URL.createObjectURL(wavBlob);

  const a = document.createElement('a');
  a.href = url;
  a.download = '错题合集.wav';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return allSegments.length;
}
