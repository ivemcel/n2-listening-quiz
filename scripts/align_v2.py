#!/usr/bin/env python3
"""
N2 Timestamp Alignment v2 — Uses question-number markers ("X番") as boundaries.

The key insight: Whisper reliably transcribes the spoken question numbers
("一番", "二番", ..., "十二番") that precede each question. We use these
as natural boundaries and verify the content between them matches the
expected question text from questions.json.

Usage:
  source venv/bin/activate
  python scripts/align_v2.py
"""

import json
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

# Map Japanese number words to digits
NUM_MAP = {
    'いち': 1, 'に': 2, 'さん': 3, 'よん': 4, 'よ': 4, 'ご': 5,
    'ろく': 6, 'しち': 7, 'なな': 7, 'はち': 8, 'きゅう': 9, 'く': 9,
    'じゅう': 10, 'じゅういち': 11, 'じゅうに': 12,
    'いちばん': 1, 'にばん': 2, 'さんばん': 3, 'よんばん': 4,
}
# Also match digit-based numbers that whisper sometimes outputs
NUM_PATTERN = re.compile(r'(?:(\d+)\s*番|([一二三四五六七八九十]+)\s*番)')

def parse_session_starts():
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
    with open(QUESTIONS_PATH, 'r') as f:
        return json.load(f)

def extract_session_audio(session_id, start_s, end_s):
    output_path = SESSIONS_DIR / f"{session_id}.wav"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not output_path.exists():
        duration = end_s - start_s
        cmd = [
            "ffmpeg", "-y", "-ss", str(start_s), "-t", str(duration),
            "-i", str(AUDIO_PATH), "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1", str(output_path)
        ]
        subprocess.run(cmd, capture_output=True, check=True)
    return str(output_path)

def normalize_text(text):
    text = text.strip()
    text = re.sub(r'\s+', '', text)
    for ch in '、。．？！〜…「」（）・ー':
        text = text.replace(ch, '')
    return text

def lcs_ratio(s1, s2):
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
    return prev[n] / max(m, n)

def find_question_markers(segments):
    """
    Find segments that contain question number markers like "一番", "二番", etc.
    Returns list of (question_number, segment_index, is_at_segment_end).
    is_at_segment_end=True means the marker is at the END of the segment,
    so the actual question content starts at the NEXT segment.
    """
    markers = []

    # Pattern 1: "X番" where X is digits or kanji (e.g., "1番", "一番")
    marker_pat = re.compile(r'(\d+|[一二三四五六七八九十]+)\s*番')
    # Pattern 2: hiragana "いちばん" (sometimes whisper uses hiragana)
    hiragana_ichiban = re.compile(r'\bいちばん\b')

    for i, seg in enumerate(segments):
        text = seg.text.strip()

        # Check hiragana "いちばん" first
        if hiragana_ichiban.search(text):
            # Only match if it looks like a question marker (early in segment or segment is short)
            m = hiragana_ichiban.search(text)
            if m.start() < len(text) * 0.4 or len(text) < 30:
                markers.append((1, i, False))
                # Don't continue - still check for other markers in the same segment
                # (rare but possible)

        for m in marker_pat.finditer(text):
            num_str = m.group(1)
            if num_str.isdigit():
                qnum = int(num_str)
            else:
                qnum = kanji_to_int(num_str)
            if not (1 <= qnum <= 12):
                continue

            # Avoid false positives: "一番" meaning "best/most" (not question marker)
            # Heuristic: if "一番" appears after position 0.3 and segment is long (>25 chars),
            # it's likely "best" not "Question 1"
            if qnum == 1 and m.start() > 0 and len(text) > 25 and m.start() / len(text) > 0.3:
                # Check if it's part of a comparative phrase (common for "best" usage)
                before = text[max(0, m.start()-5):m.start()]
                if before and not before[-1] in ' 　、。':
                    continue  # Skip - likely "best" not question marker

            # Determine if marker is at segment end
            marker_end = m.end()
            is_at_end = (marker_end > len(text) * 0.6) or text.endswith('番')

            markers.append((qnum, i, is_at_end))

    # Deduplicate by question number (keep first occurrence)
    seen = set()
    unique = []
    for qnum, idx, is_end in markers:
        if qnum not in seen:
            seen.add(qnum)
            unique.append((qnum, idx, is_end))
    unique.sort(key=lambda x: x[0])

    return unique

def kanji_to_int(kanji):
    """Convert kanji numeral to integer (supports up to 十二)."""
    values = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
              '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}
    if len(kanji) == 1:
        return values.get(kanji, 0)
    elif kanji == '十':
        return 10
    elif kanji.startswith('十'):
        return 10 + values.get(kanji[1], 0)
    elif kanji.endswith('十'):
        return values.get(kanji[0], 0) * 10
    return 0

def build_question_text(q):
    dialogue = q.get("dialogue", {})
    dialogue_text = dialogue.get("japanese", "")
    options = q.get("options", [])
    option_texts = [opt.get("japanese", "") for opt in options]
    # Remove furigana in parentheses from target text
    dialogue_text = re.sub(r'（[^）]*）', '', dialogue_text)
    option_texts = [re.sub(r'（[^）]*）', '', t) for t in option_texts]
    return dialogue_text + " " + " ".join(option_texts)

def verify_question_content(segments, start_idx, end_idx, expected_text):
    """Verify that segments between markers match the expected question text."""
    combined = "".join(
        normalize_text(segments[i].text)
        for i in range(start_idx, min(end_idx + 1, len(segments)))
    )
    norm_expected = normalize_text(expected_text)
    return lcs_ratio(norm_expected, combined)

def align_with_markers(segments, questions_data, session_id):
    """Align questions using transcribed markers as boundaries."""
    question_list = questions_data.get("questions", [])
    if not question_list:
        return {}

    markers = find_question_markers(segments)
    marker_summary = [f'Q{m[0]}@seg{m[1]}{"(end)" if m[2] else ""}' for m in markers]
    print(f"    Found {len(markers)} markers: {marker_summary}")

    timestamps = {}

    for idx, q in enumerate(question_list):
        q_num = q["number"]

        # Find the marker for this question
        marker = next((m for m in markers if m[0] == q_num), None)

        if marker is None:
            # Fallback for missing Q1 marker: use Q2's position
            if q_num == 1:
                q2_marker = next((m for m in markers if m[0] == 2), None)
                if q2_marker:
                    # Q1 ends where Q2 starts (minus the "2番" intro)
                    q2_idx = q2_marker[1]
                    q2_is_end = q2_marker[2]
                    start_seg = 0  # Q1 starts at beginning of session
                    end_seg = q2_idx - 1 if not q2_is_end else q2_idx
                    if end_seg < 0:
                        end_seg = 0
                    q_start = segments[start_seg].start
                    q_end = segments[end_seg].end
                    expected = build_question_text(q)
                    score = verify_question_content(segments, start_seg, end_seg, expected)
                    timestamps[str(q_num)] = {
                        "start": round(q_start, 2),
                        "end": round(q_end, 2),
                        "_score": round(score, 3),
                    }
                    print(f"    ⚠️ Q 1: no marker, inferred from Q2: {q_start:.1f}s - {q_end:.1f}s  score={score:.3f}")
                    continue

            print(f"    Q{q_num}: ⚠️  No marker found")
            timestamps[str(q_num)] = {"start": 0, "end": 0, "_score": 0}
            continue

        marker_idx, is_at_end = marker[1], marker[2]

        # If marker is at the END of its segment, question content starts at NEXT segment
        if is_at_end and q_num > 1:
            start_seg = marker_idx + 1
        else:
            start_seg = marker_idx

        # Find the next marker's position for the end boundary
        # We want: end at the segment BEFORE the next marker
        # But if the next marker is at the end of its segment, the actual
        # content boundary is at that segment (since the marker is the last thing)
        next_markers = [m for m in markers if m[0] > q_num]
        if next_markers:
            next_m = next_markers[0]
            next_idx = next_m[1]
            next_is_end = next_m[2]
            if next_is_end:
                # Next marker is at segment end; this question ends
                # just before the content that follows the marker
                end_seg = next_idx  # include the segment with the trailing marker
            else:
                end_seg = next_idx - 1
        else:
            end_seg = len(segments) - 1

        if end_seg < start_seg:
            end_seg = start_seg

        q_start = segments[start_seg].start
        q_end = segments[end_seg].end

        # Verify content
        expected = build_question_text(q)
        score = verify_question_content(segments, start_seg, end_seg, expected)

        timestamps[str(q_num)] = {
            "start": round(q_start, 2),
            "end": round(q_end, 2),
            "_score": round(score, 3),
        }

        status = "✅" if score > 0.08 else "⚠️"
        combined = " | ".join(segments[i].text.strip()[:80]
                              for i in range(start_seg, min(end_seg + 1, start_seg + 6)))
        print(f"    {status} Q{q_num:2d}: {q_start:7.1f}s - {q_end:7.1f}s  segs[{start_seg}-{end_seg}]  score={score:.3f}")
        print(f"           {combined[:200]}")

    return timestamps

def main():
    print("🎯 N2 Timestamp Alignment v2 (Marker-based)")
    print()

    sessions = parse_session_starts()
    questions = load_questions()
    print(f"📋 {len(sessions)} sessions\n")

    # Load model once
    print("🤖 Loading Whisper...")
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    print()

    all_timestamps = {}

    for i, (session_id, start_s) in enumerate(sessions):
        print(f"{'='*55}")
        print(f"📌 [{i+1}/{len(sessions)}] {session_id}  (abs start: {start_s}s)")

        # Calculate end
        if i < len(sessions) - 1:
            end_s = sessions[i + 1][1]
        else:
            end_s = start_s + 420

        # Extract audio
        audio_path = extract_session_audio(session_id, start_s, end_s)

        # Transcribe
        print(f"    Transcribing...")
        segments_raw, info = model.transcribe(
            audio_path, language="ja", beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=200),
        )
        segments = list(segments_raw)
        print(f"    {len(segments)} segments, lang={info.language}")

        # Print all segments for debugging
        for j, seg in enumerate(segments):
            print(f"      [{j:3d}] {seg.start:7.1f}s - {seg.end:7.1f}s: {seg.text.strip()[:150]}")

        # Align
        if session_id in questions:
            print(f"    Aligning {len(questions[session_id]['questions'])} questions...")
            ts = align_with_markers(segments, questions[session_id], session_id)

            # Convert to absolute
            abs_ts = {}
            for qn, t in ts.items():
                t.pop("_score", None)
                abs_ts[qn] = {
                    "start": round(start_s + t["start"], 2),
                    "end": round(start_s + t["end"], 2),
                }
            all_timestamps[session_id] = abs_ts

            matched = sum(1 for t in abs_ts.values() if t["end"] - t["start"] > 2)
            print(f"    ✅ {matched}/{len(abs_ts)} aligned")
        else:
            print(f"    ⚠️  No questions data")
            all_timestamps[session_id] = {}

    # Save
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(all_timestamps, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Saved to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
