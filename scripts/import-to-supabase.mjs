/**
 * Import questions.json + timestamps.json → Supabase database
 *
 * Usage:
 *   1. Create a .env file with:
 *      VITE_SUPABASE_URL=https://<project-id>.supabase.co
 *      SUPABASE_SERVICE_ROLE_KEY=<service_role key>
 *   2. Run: node scripts/import-to-supabase.mjs
 *
 * NOTE: Uses the service_role key to bypass RLS for bulk inserts.
 *       Never expose this key to the frontend.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Read env vars from .env (simple manual parse, no dotenv needed)
const envPath = resolve(root, '.env');
let supabaseUrl = '';
let serviceRoleKey = '';
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('VITE_SUPABASE_URL=')) {
      supabaseUrl = trimmed.slice('VITE_SUPABASE_URL='.length).trim();
    }
    if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      serviceRoleKey = trimmed.slice('SUPABASE_SERVICE_ROLE_KEY='.length).trim();
    }
  }
} catch {
  console.error('❌ .env file not found. Create one with VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing env vars. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Load local JSON data
const questionsData = JSON.parse(
  readFileSync(resolve(root, 'data', 'questions.json'), 'utf-8')
);
const timestampsData = JSON.parse(
  readFileSync(resolve(root, 'data', 'timestamps.json'), 'utf-8')
);

async function importSessions() {
  console.log('\n📅 Importing sessions...');
  const sessions = Object.entries(questionsData).map(([id, data]) => ({
    id,
    year: data.year,
    month: data.month,
    label: `${data.year}年${data.month}月`,
    audio_url: `/audio/${id}.mp3`,
  }));

  const { error } = await supabase.from('sessions').upsert(sessions);
  if (error) throw error;
  console.log(`  ✅ ${sessions.length} sessions imported`);
}

async function importQuestionsAndOptions() {
  console.log('\n📝 Importing questions & options...');
  let questionCount = 0;
  let optionCount = 0;

  for (const [sessionId, sessionData] of Object.entries(questionsData)) {
    const questions = [];

    for (const q of sessionData.questions) {
      questions.push({
        id: q.id,
        session_id: sessionId,
        number: q.number,
        speaker: q.dialogue?.speaker || '',
        japanese: q.dialogue?.japanese || '',
        chinese: q.dialogue?.chinese || '',
        grammar: JSON.stringify(q.grammar || []),
      });
    }

    // Insert questions for this session
    const { error: qErr } = await supabase.from('questions').upsert(questions);
    if (qErr) throw qErr;
    questionCount += questions.length;

    // Insert options for each question
    let allOptions = [];
    for (const q of sessionData.questions) {
      const opts = (q.options || []).map((o, idx) => ({
        question_id: q.id,
        label: o.label,
        japanese: o.japanese,
        chinese: o.chinese || '',
        is_correct: o.isCorrect === true,
      }));
      allOptions = allOptions.concat(opts);
    }

    const { error: oErr } = await supabase.from('options').upsert(allOptions);
    if (oErr) throw oErr;
    optionCount += allOptions.length;
  }

  console.log(`  ✅ ${questionCount} questions imported`);
  console.log(`  ✅ ${optionCount} options imported`);
}

async function importTimestamps() {
  console.log('\n⏱️  Importing timestamps...');
  const records = [];

  for (const [sessionId, questions] of Object.entries(timestampsData)) {
    for (const [number, ts] of Object.entries(questions)) {
      const questionId = `${sessionId}-${number}`;
      records.push({
        question_id: questionId,
        start_sec: ts.start,
        end_sec: ts.end,
      });
    }
  }

  const { error } = await supabase.from('timestamps').upsert(records);
  if (error) throw error;
  console.log(`  ✅ ${records.length} timestamps imported`);
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('🚀 Importing data to Supabase...');
  console.log(`   URL: ${supabaseUrl}`);

  try {
    // Clear existing data first (order matters for foreign keys)
    console.log('🗑️  Clearing existing data...');
    await supabase.from('wrong_book').delete().neq('id', 0);
    await supabase.from('answer_records').delete().neq('id', 0);
    await supabase.from('timestamps').delete().neq('id', 0);
    await supabase.from('options').delete().neq('id', 0);
    await supabase.from('questions').delete().neq('id', 0);
    await supabase.from('sessions').delete().neq('id', 0);
    console.log('  ✅ Cleared');

    await importSessions();
    await importQuestionsAndOptions();
    await importTimestamps();

    console.log('\n🎉 Import complete!');
  } catch (err) {
    console.error('\n❌ Import failed:', err.message);
    process.exit(1);
  }
}

main();
