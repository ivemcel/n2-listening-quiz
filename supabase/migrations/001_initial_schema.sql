-- ============================================================
-- N2听力即时问答 — Initial Database Schema
-- ============================================================

-- ─── Extensions ────────────────────────────────────────────

-- Enable UUID generation for user IDs (references auth.users)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Reference Tables (read-only for all users) ───────────

-- 考试场次（如 2016年7月）
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,                -- "201607"
  year        INTEGER NOT NULL,                -- 2016
  month       INTEGER NOT NULL,                -- 7
  label       TEXT,                            -- "2016年7月"
  audio_url   TEXT                             -- 音频文件 URL (Supabase Storage)
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sessions: anyone can read"
  ON sessions FOR SELECT
  USING (true);

-- 题目
CREATE TABLE questions (
  id          TEXT PRIMARY KEY,                -- "201607-1"
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,                -- 题号 1~N
  speaker     TEXT DEFAULT '女',               -- "男" / "女"
  japanese    TEXT NOT NULL,                   -- 对话原文（含假名标注）
  chinese     TEXT,                            -- 中文翻译
  grammar     JSONB DEFAULT '[]'::jsonb,       -- 语法点数组

  UNIQUE(session_id, number)
);

CREATE INDEX idx_questions_session ON questions(session_id);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions: anyone can read"
  ON questions FOR SELECT
  USING (true);

-- 选项
CREATE TABLE options (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,                   -- "1", "2", "3"
  japanese    TEXT NOT NULL,
  chinese     TEXT,
  is_correct  BOOLEAN DEFAULT false
);

CREATE INDEX idx_options_question ON options(question_id);

ALTER TABLE options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "options: anyone can read"
  ON options FOR SELECT
  USING (true);

-- 音频时间戳（精确 seek 到每题起始位置）
CREATE TABLE timestamps (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE UNIQUE,
  start_sec   DOUBLE PRECISION NOT NULL,
  end_sec     DOUBLE PRECISION NOT NULL
);

ALTER TABLE timestamps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "timestamps: anyone can read"
  ON timestamps FOR SELECT
  USING (true);

-- ─── User Data Tables (private, isolated by RLS) ──────────

-- 用户答题记录
CREATE TABLE answer_records (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id     TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  selected_label  TEXT NOT NULL,               -- "1", "2", "3"
  is_correct      BOOLEAN NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, question_id)                 -- 每题保留最新记录
);

CREATE INDEX idx_answer_records_user ON answer_records(user_id);
CREATE INDEX idx_answer_records_session ON answer_records(user_id, session_id);

ALTER TABLE answer_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "answer_records: select own"
  ON answer_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "answer_records: insert own"
  ON answer_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "answer_records: update own"
  ON answer_records FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "answer_records: delete own"
  ON answer_records FOR DELETE
  USING (auth.uid() = user_id);

-- 错题本
CREATE TABLE wrong_book (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, question_id)
);

CREATE INDEX idx_wrong_book_user ON wrong_book(user_id);

ALTER TABLE wrong_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wrong_book: select own"
  ON wrong_book FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wrong_book: insert own"
  ON wrong_book FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wrong_book: delete own"
  ON wrong_book FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Helper: update updated_at on answer_records ──────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON answer_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Storage bucket for audio files ───────────────────────

-- Note: Buckets must be created via Supabase dashboard or API.
-- Run this in SQL Editor after creating the "audio" bucket:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', true);
--   CREATE POLICY "audio: public read" ON storage.objects
--     FOR SELECT USING (bucket_id = 'audio');
