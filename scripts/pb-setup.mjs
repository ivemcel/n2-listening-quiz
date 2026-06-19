/**
 * PocketBase Schema Setup + Data Import
 * Uses the official PocketBase JS SDK.
 *
 * Usage: node scripts/pb-setup.mjs
 * Requires: PocketBase running at http://127.0.0.1:8090
 */

import PocketBase from 'pocketbase';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PB_URL = 'http://127.0.0.1:8090';
const ADMIN_EMAIL = 'admin@n2.local';
const ADMIN_PASSWORD = 'admin123456';

// ─── Helpers ────────────────────────────────────────────────

function rel(name, collectionName, opts = {}) {
  return {
    name,
    type: 'relation',
    required: opts.required !== false,
    unique: !!opts.unique,
    options: {
      collectionId: collectionName,
      cascadeDelete: false,
      maxSelect: 1,
    },
  };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log('🚀 PocketBase Setup\n');

  const pb = new PocketBase(PB_URL);

  // 1. Login as admin (use raw fetch — SDK may have API mismatch)
  console.log('🔑 Logging in as admin...');
  const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const authData = await authRes.json();
  if (!authRes.ok) throw new Error(`Auth failed: ${JSON.stringify(authData)}`);
  pb.authStore.save(authData.token, null); // Set token on SDK instance
  console.log('  ✅ Authenticated');

  // 2. Remove existing collections
  console.log('\n🗑️  Removing existing collections...');
  const existing = await pb.collections.getFullList();
  const order = ['wrong_book', 'answer_records', 'timestamps', 'options', 'questions', 'sessions'];
  for (const name of order) {
    const col = existing.find(c => c.name === name);
    if (col) {
      await pb.collections.delete(col.id);
      console.log(`  ✅ Removed ${name}`);
    }
  }

  // 3. Create collections
  console.log('\n📐 Creating collections...');

  const sessions = await pb.collections.create({
    name: 'sessions',
    type: 'base',
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    schema: [
      { name: 'code', type: 'text', required: true, unique: true }, // "201607"
      { name: 'year', type: 'number', required: true },
      { name: 'month', type: 'number', required: true },
      { name: 'label', type: 'text' },
      { name: 'audio_url', type: 'text' },
    ],
  });
  console.log(`  ✅ sessions (${sessions.id})`);

  const questions = await pb.collections.create({
    name: 'questions',
    type: 'base',
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    schema: [
      { name: 'code', type: 'text', required: true, unique: true }, // "201607-1"
      rel('session', sessions.id),
      { name: 'number', type: 'number', required: true },
      { name: 'speaker', type: 'text' },
      { name: 'japanese', type: 'text', required: true },
      { name: 'chinese', type: 'text' },
      { name: 'grammar', type: 'text' },
    ],
  });
  console.log(`  ✅ questions (${questions.id})`);

  const options = await pb.collections.create({
    name: 'options',
    type: 'base',
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    schema: [
      rel('question', questions.id),
      { name: 'label', type: 'text', required: true },
      { name: 'japanese', type: 'text', required: true },
      { name: 'chinese', type: 'text' },
      { name: 'is_correct', type: 'bool' },
    ],
  });
  console.log(`  ✅ options (${options.id})`);

  await pb.collections.create({
    name: 'timestamps',
    type: 'base',
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,
    schema: [
      rel('question', questions.id, { unique: true }),
      { name: 'start_sec', type: 'number', required: true },
      { name: 'end_sec', type: 'number', required: true },
    ],
  });
  console.log('  ✅ timestamps');

  await pb.collections.create({
    name: 'answer_records',
    type: 'base',
    listRule: '@request.auth.id != "" && user = @request.auth.id',
    viewRule: '@request.auth.id != "" && user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && user = @request.auth.id',
    schema: [
      rel('user', '_pb_users_auth_'),
      rel('question', questions.id),
      rel('session', sessions.id),
      { name: 'selected_label', type: 'text', required: true },
      { name: 'is_correct', type: 'bool', required: true },
    ],
  });
  console.log('  ✅ answer_records');

  await pb.collections.create({
    name: 'wrong_book',
    type: 'base',
    listRule: '@request.auth.id != "" && user = @request.auth.id',
    viewRule: '@request.auth.id != "" && user = @request.auth.id',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && user = @request.auth.id',
    deleteRule: '@request.auth.id != "" && user = @request.auth.id',
    schema: [
      rel('user', '_pb_users_auth_'),
      rel('question', questions.id),
    ],
  });
  console.log('  ✅ wrong_book');

  // 4. Import data
  console.log('\n📥 Importing data...');

  const questionsData = JSON.parse(
    readFileSync(resolve(ROOT, 'data', 'questions.json'), 'utf-8')
  );
  const timestampsData = JSON.parse(
    readFileSync(resolve(ROOT, 'data', 'timestamps.json'), 'utf-8')
  );

  // ── Sessions ──
  // code (e.g. "201607") → PocketBase record ID
  const sessionIdMap = new Map();
  let sc = 0;
  const totalSessions = Object.keys(questionsData).length;
  for (const [code, data] of Object.entries(questionsData)) {
    const record = await pb.collection('sessions').create({
      code,
      year: data.year,
      month: data.month,
      label: `${data.year}年${data.month}月`,
      audio_url: `/api/files/audio/${code}.mp3`,
    });
    sessionIdMap.set(code, record.id);
    sc++;
    process.stdout.write(`  Sessions: ${sc}/${totalSessions}\r`);
  }
  console.log(`\n  ✅ ${sc} sessions`);

  // ── Questions + Options ──
  // code (e.g. "201607-1") → PocketBase record ID
  const questionIdMap = new Map();
  let qc = 0, oc = 0;
  for (const [sessionCode, sessionData] of Object.entries(questionsData)) {
    const sessionPbId = sessionIdMap.get(sessionCode);
    for (const q of sessionData.questions) {
      const record = await pb.collection('questions').create({
        code: q.id,
        session: sessionPbId,
        number: q.number,
        speaker: q.dialogue?.speaker || '',
        japanese: q.dialogue?.japanese || '',
        chinese: q.dialogue?.chinese || '',
        grammar: JSON.stringify(q.grammar || []),
      });
      questionIdMap.set(q.id, record.id);
      qc++;

      for (const o of (q.options || [])) {
        await pb.collection('options').create({
          question: record.id,
          label: o.label,
          japanese: o.japanese,
          chinese: o.chinese || '',
          is_correct: o.isCorrect === true,
        });
        oc++;
      }
      process.stdout.write(`  Questions: ${qc}  Options: ${oc}\r`);
    }
  }
  console.log(`\n  ✅ ${qc} questions, ${oc} options`);

  // ── Timestamps ──
  let tc = 0;
  for (const [sessionCode, questions] of Object.entries(timestampsData)) {
    for (const [number, ts] of Object.entries(questions)) {
      const code = `${sessionCode}-${number}`;
      const questionPbId = questionIdMap.get(code);
      if (questionPbId) {
        await pb.collection('timestamps').create({
          question: questionPbId,
          start_sec: ts.start,
          end_sec: ts.end,
        });
        tc++;
      }
    }
    process.stdout.write(`  Timestamps: ${tc}\r`);
  }
  console.log(`\n  ✅ ${tc} timestamps`);

  console.log('\n🎉 Setup complete!');
  console.log(`   Admin UI:  ${PB_URL}/_/`);
  console.log(`   REST API:  ${PB_URL}/api/`);
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  console.error(err.response?.data || '');
  process.exit(1);
});
