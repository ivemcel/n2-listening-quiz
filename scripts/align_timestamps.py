#!/usr/bin/env python3
"""
N2 Listening Timestamp Alignment Script
Uses faster-whisper to transcribe audio with timestamps,
then matches transcribed text against known questions to extract
accurate per-question start/end timestamps.

Usage:
  source venv/bin/activate
  python scripts/align_timestamps.py
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_PATH = ROOT / "public" / "audio" / "n2_full.mp3"
QUESTIONS_PATH = ROOT / "data" / "questions.json"
SESSION_STARTS_PATH = ROOT / "data" / "session_starts.txt"
OUTPUT_PATH = ROOT / "data" / "timestamps.json"
SESSIONS_DIR = ROOT / "data" / "sessions"
ALIGN_LOG = ROOT / "data" / "align_log.txt"

def parse_session_starts():
    """Parse session_starts.txt, return list of (session_id, start_seconds)."""
    sessions = []
    with open(SESSION_STARTS_PATH, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            session_id = parts[0]
            time_str = parts[1]
            parts_time = time_str.split(':')
            parts_time = [int(p) for p in parts_time]
            if len(parts_time) == 3:
                seconds = parts_time[0] * 3600 + parts_time[1] * 60 + parts_time[2]
            elif len(parts_time) == 2:
                seconds = parts_time[0] * 60 + parts_time[1]
            else:
                seconds = parts_time[0]
            sessions.append((session_id, seconds))
    return sessions

def load_questions():
    """Load questions.json."""
    with open(QUESTIONS_PATH, 'r') as f:
        return json.load(f)

def extract_session_audio(session_id, start_s, end_s):
    """Extract a session's audio segment using ffmpeg."""
    output_path = SESSIONS_DIR / f"{session_id}.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_path.exists():
        return str(output_path)

    duration = end_s - start_s
    print(f"  🎵 Extracting {session_id} ({start_s}s - {end_s}s, {duration:.0f}s)...")

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_s),
        "-t", str(duration),
        "-i", str(AUDIO_PATH),
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        str(output_path)
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return str(output_path)

def normalize_text(text):
    """Remove spaces/punctuation for matching."""
    text = text.strip()
    text = re.sub(r'\s+', '', text)
    text = text.replace('、', '').replace('。', '').replace('．', '')
    text = text.replace('？', '').replace('！', '').replace('〜', '')
    text = text.replace('…', '').replace('「', '').replace('」', '')
    text = text.replace('（', '').replace('）', '').replace('・', '')
    text = text.replace('ー', '')  # long vowel mark
    return text

def lcs_ratio(s1, s2):
    """Longest common subsequence ratio using 2-row DP."""
    if not s1 or not s2:
        return 0.0
    m, n = len(s1), len(s2)
    prev = [0] * (n + 1)
    curr = [0] * (n + 1)
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i-1] == s2[j-1]:
                curr[j] = prev[j-1] + 1
            else:
                curr[j] = max(prev[j], curr[j-1])
        prev, curr = curr, prev
    lcs_len = prev[n]
    return lcs_len / max(m, n)

def build_question_text(q):
    """Build full text for a question: dialogue + all 3 options."""
    dialogue = q.get("dialogue", {})
    dialogue_text = dialogue.get("japanese", "")
    options = q.get("options", [])
    option_texts = [opt.get("japanese", "") for opt in options]
    return dialogue_text + " " + " ".join(option_texts)

def find_question_in_segments(target_text, segments, start_from=0):
    """
    Find which consecutive segments best match the target text.
    Returns (start_idx, end_idx, score).
    """
    norm_target = normalize_text(target_text)

    best_start = -1
    best_end = -1
    best_score = 0.0

    max_window = min(25, len(segments) - start_from)

    for window_size in range(1, max_window + 1):
        for start_idx in range(start_from, len(segments) - window_size + 1):
            end_idx = start_idx + window_size - 1
            window_text = "".join(
                normalize_text(segments[i].text)
                for i in range(start_idx, end_idx + 1)
            )
            score = lcs_ratio(norm_target, window_text)

            # Penalize window that's too short relative to target
            if len(window_text) < len(norm_target) * 0.4:
                score *= 0.3

            if score > best_score:
                best_score = score
                best_start = start_idx
                best_end = end_idx

    return best_start, best_end, best_score

def transcribe_session(audio_path, model):
    """Run faster-whisper transcription on a session audio file."""
    segments_raw, info = model.transcribe(
        audio_path,
        language="ja",
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300),
    )
    return list(segments_raw), info.language

def align_session(segments, questions_data, session_id, log_lines):
    """Align transcribed segments with known questions."""
    if "questions" not in questions_data:
        log_lines.append(f"  ⚠️  No questions data for {session_id}\n")
        return {}

    question_list = questions_data["questions"]
    timestamps = {}
    search_start = 0

    for q in question_list:
        q_num = q["number"]
        full_text = build_question_text(q)
        norm_target = normalize_text(full_text)

        start_idx, end_idx, score = find_question_in_segments(full_text, segments, search_start)

        if start_idx >= 0 and score > 0.12:
            q_start = segments[start_idx].start
            q_end = segments[end_idx].end
            timestamps[str(q_num)] = {
                "start": round(q_start, 2),
                "end": round(q_end, 2),
            }
            search_start = end_idx + 1

            # Build matched text for logging
            matched = " | ".join(segments[i].text.strip() for i in range(start_idx, end_idx + 1))
            log_lines.append(f"    Q{q_num:2d}: {q_start:7.1f}s - {q_end:7.1f}s  score={score:.3f}\n")
            log_lines.append(f"           matched: {matched[:150]}\n")
        else:
            # Fallback: use average spacing
            log_lines.append(f"    Q{q_num:2d}: ⚠️  NO MATCH (best={score:.3f}), using estimate\n")
            timestamps[str(q_num)] = {
                "start": round(0, 2),
                "end": round(0, 2),
            }

    return timestamps

def main():
    print("🎯 N2 Listening Timestamp Alignment")
    print(f"   Audio: {AUDIO_PATH}")
    print()

    # Load data
    sessions = parse_session_starts()
    questions = load_questions()
    print(f"📋 {len(sessions)} sessions, {len(questions)} question sets\n")

    # Load Whisper model once
    print("🤖 Loading Whisper model (small)...")
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    print("   Model loaded.\n")

    # Process each session
    all_timestamps = {}
    all_logs = []

    for i, (session_id, start_s) in enumerate(sessions):
        print(f"{'='*55}")
        print(f"📌 [{i+1}/{len(sessions)}] {session_id}")
        all_logs.append(f"\n{'='*55}\n{session_id} (absolute start: {start_s}s)\n")

        # Calculate session end
        if i < len(sessions) - 1:
            end_s = sessions[i + 1][1]
        else:
            end_s = start_s + 420  # estimate ~7 min for last session

        # Extract audio
        print(f"   Extracting audio ({start_s}s - {end_s}s)...")
        audio_path = extract_session_audio(session_id, start_s, end_s)

        # Transcribe
        print(f"   Transcribing...")
        segments, lang = transcribe_session(audio_path, model)
        print(f"   → {len(segments)} segments, language: {lang}")
        all_logs.append(f"  {len(segments)} segments, language: {lang}\n")

        # Align questions
        if session_id in questions:
            print(f"   Aligning {len(questions[session_id]['questions'])} questions...")
            timestamps = align_session(
                segments, questions[session_id], session_id, all_logs
            )
            # Convert to absolute timestamps (add session start offset)
            abs_timestamps = {}
            for q_num, ts in timestamps.items():
                abs_timestamps[q_num] = {
                    "start": round(start_s + ts["start"], 2),
                    "end": round(start_s + ts["end"], 2),
                }
            all_timestamps[session_id] = abs_timestamps

            matched = sum(1 for ts in abs_timestamps.values() if ts["start"] > start_s)
            print(f"   ✅ {matched}/{len(abs_timestamps)} questions aligned")
            all_logs.append(f"  ✅ {matched}/{len(abs_timestamps)} aligned\n")
        else:
            print(f"   ⚠️  No questions data found")
            all_timestamps[session_id] = {}
            all_logs.append(f"  ⚠️  No questions data\n")

    # Save timestamps
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(all_timestamps, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Timestamps saved to {OUTPUT_PATH}")

    # Save alignment log
    with open(ALIGN_LOG, 'w') as f:
        f.writelines(all_logs)
    print(f"✅ Alignment log saved to {ALIGN_LOG}")

if __name__ == "__main__":
    main()
