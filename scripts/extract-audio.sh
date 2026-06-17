#!/bin/bash
# Extract audio from MP4 and convert to MP3 for web playback.
# Usage: bash scripts/extract-audio.sh

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP4="$ROOT/N2听力_2010.7-2024.7.28340651157.mp4"
OUT="$ROOT/public/audio/n2_full.mp3"

echo "🔊 Extracting audio from MP4..."

if [ ! -f "$MP4" ]; then
  echo "❌ MP4 file not found: $MP4"
  exit 1
fi

# Extract audio and convert to MP3 (192kbps CBR for good quality)
# Using libmp3lame for MP3 encoding
ffmpeg -i "$MP4" \
  -vn \
  -acodec libmp3lame \
  -b:a 192k \
  -ar 44100 \
  -ac 2 \
  -y \
  "$OUT" 2>&1

echo ""
echo "✅ Audio extracted to: $OUT"
echo "📊 File size: $(du -h "$OUT" | cut -f1)"
