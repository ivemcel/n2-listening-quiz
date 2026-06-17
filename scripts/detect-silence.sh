#!/bin/bash
# Detect silence gaps and map questions to timestamps.
# Usage: bash scripts/detect-silence.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUDIO="$ROOT/public/audio/n2_full.mp3"
SESSIONS_FILE="$ROOT/data/session_starts.txt"
OUT="$ROOT/data/timestamps.json"
SILENCE_LOG="$ROOT/data/silence_detect.log"

if [ ! -f "$AUDIO" ]; then
  echo "❌ Audio file not found: $AUDIO"
  echo "   Run extract-audio.sh first."
  exit 1
fi

if [ ! -f "$SESSIONS_FILE" ]; then
  echo "❌ Session starts file not found: $SESSIONS_FILE"
  exit 1
fi

echo "🔍 Step 1: Detecting silence gaps in full audio (~3 min)..."
ffmpeg -i "$AUDIO" \
  -af "silencedetect=noise=-30dB:d=2.0" \
  -f null - \
  -y 2>&1 | tee "$SILENCE_LOG" | grep -E "silence_(start|end|duration)" || true

echo ""
echo "📝 Step 2: Computing question boundaries..."

node - "$ROOT" "$SESSIONS_FILE" "$SILENCE_LOG" "$OUT" << 'NODESCRIPT'
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[1];
const sessionsFile = process.argv[2];
const silenceLog = process.argv[3];
const outPath = process.argv[4];

// Load questions data
const questionsPath = path.join(ROOT, 'data', 'questions.json');
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));

// Parse session starts (manually, no associative arrays needed)
const sessionOrder = [];
const sessionStarts = {};
const sessionLines = fs.readFileSync(sessionsFile, 'utf-8').trim().split('\n');
for (const line of sessionLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) continue;
  const sessionId = parts[0];
  const timeStr = parts[1];
  const timeParts = timeStr.split(':').map(Number);
  let seconds = 0;
  if (timeParts.length === 3) seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
  else if (timeParts.length === 2) seconds = timeParts[0] * 60 + timeParts[1];
  else seconds = timeParts[0];
  sessionStarts[sessionId] = seconds;
  sessionOrder.push(sessionId);
  console.log(`  📍 ${sessionId} at ${timeStr} (${seconds}s)`);
}

// Parse silence log
const silenceLogText = fs.readFileSync(silenceLog, 'utf-8');
const silenceStarts = [];
const silenceEnds = [];

const startRegex = /silence_start:\s*([\d.]+)/g;
const endRegex = /silence_end:\s*([\d.]+)/g;

let match;
while ((match = startRegex.exec(silenceLogText)) !== null) {
  silenceStarts.push(parseFloat(match[1]));
}
while ((match = endRegex.exec(silenceLogText)) !== null) {
  silenceEnds.push(parseFloat(match[1]));
}

console.log(`\n  Found ${silenceStarts.length} silence gaps`);

// For each session, find question boundaries
const timestamps = {};

for (let i = 0; i < sessionOrder.length; i++) {
  const sessionId = sessionOrder[i];
  const sessionStart = sessionStarts[sessionId];
  const nextSessionStart = i < sessionOrder.length - 1
    ? sessionStarts[sessionOrder[i + 1]]
    : Infinity;

  const sessionQuestions = questions[sessionId]?.questions || [];
  const numQuestions = sessionQuestions.length;

  if (numQuestions === 0) {
    timestamps[sessionId] = {};
    continue;
  }

  // Find silence gaps within this session's time window
  const gaps = [];
  for (let j = 0; j < silenceStarts.length; j++) {
    const gapStart = silenceStarts[j];
    const gapEnd = silenceEnds[j] || (gapStart + 2);
    if (gapStart >= sessionStart && gapStart < nextSessionStart) {
      gaps.push({ start: gapStart, end: gapEnd, duration: gapEnd - gapStart });
    }
  }

  // Sort gaps by duration descending (longest pauses → likely question boundaries)
  gaps.sort((a, b) => b.duration - a.duration);

  // We need (numQuestions - 1) boundaries
  const numBoundaries = Math.min(numQuestions - 1, gaps.length);
  const boundaries = gaps.slice(0, numBoundaries).sort((a, b) => a.start - b.start);

  // Build question segments
  timestamps[sessionId] = {};

  let segStart = sessionStart;
  for (let q = 0; q < numQuestions; q++) {
    const qNum = sessionQuestions[q].number;
    let segEnd;

    if (q < boundaries.length) {
      segEnd = boundaries[q].start;
    } else if (q === numQuestions - 1) {
      segEnd = i < sessionOrder.length - 1 ? nextSessionStart : segStart + 30;
    } else {
      segEnd = segStart + 30;
    }

    // Clamp to reasonable per-question length (5-60 seconds)
    if (segEnd - segStart < 5) segEnd = segStart + 15;
    if (segEnd - segStart > 60) segEnd = segStart + 45;

    timestamps[sessionId][qNum] = {
      start: parseFloat(segStart.toFixed(2)),
      end: parseFloat(segEnd.toFixed(2)),
    };

    segStart = q < boundaries.length ? boundaries[q].end : segEnd;
  }

  console.log(`  ${sessionId}: ${numQuestions} questions mapped (${boundaries.length} boundaries used)`);
}

// Write output
fs.writeFileSync(outPath, JSON.stringify(timestamps, null, 2), 'utf-8');
console.log(`\n✅ Timestamps saved to ${outPath}`);
NODESCRIPT

echo ""
echo "✅ Done!"
