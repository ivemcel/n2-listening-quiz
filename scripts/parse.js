import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const mdPath = path.join(ROOT, '即时问题真题汇总.md');
const outPath = path.join(ROOT, 'data', 'questions.json');

const content = fs.readFileSync(mdPath, 'utf-8');

/**
 * Parse the N2 listening transcript markdown into structured JSON.
 *
 * Structure:
 *   ### 201607
 *   **1番**　女：Japanese text（furigana）Chinese translation
 *   - grammar note
 *   1. option1 text ✅
 *   2. option2 text
 *   3. option3 text
 */

// Normalize: strip the leading numbering and first header line
const lines = content.split('\n');

const sessions = {};
let currentSession = null;
let currentQuestion = null;
let mode = 'idle'; // idle | grammar | options
let pendingGrammar = [];

function parseDialogue(dialogueLine) {
  // Remove bold markers and question number
  // e.g. **1番**　女：佐藤（さとう）さん、社長（しゃちょう）がお呼（よ）びですよ。佐藤，社长在叫您哦。
  const cleaned = dialogueLine
    .replace(/\*\*(\d+)番\*\*/g, '')
    .trim();

  // Try to separate speaker from the rest
  const speakerMatch = cleaned.match(/^([男女])[：:](.+)/);
  if (!speakerMatch) {
    return { speaker: '', japanese: cleaned, chinese: '' };
  }

  const speaker = speakerMatch[1]; // 男 or 女
  const rest = speakerMatch[2].trim();

  // Separate Japanese from Chinese
  // Japanese has kanji/kana; Chinese is at the end after the Japanese
  // Pattern: Japanese text (with optional furigana in parentheses) followed by Chinese
  // The Chinese part starts when we see Chinese characters not part of furigana

  // Heuristic: find the last sequence of Chinese characters at the end
  // Japanese furigana uses （）while Chinese explanations use regular text
  // We look for a split point where Chinese starts

  // Strategy: look for a clear break - Japanese ends with 。or kana, Chinese follows
  // Often format is: "...ですよ。佐藤，社长在叫您哦。"

  let japanese = rest;
  let chinese = '';

  // Try to split on patterns like: kana+。followed by Chinese
  // Or look for the last Japanese punctuation before Chinese text
  const splitMatch = rest.match(/^(.+?)[。！？!?](.+)$/);
  if (splitMatch) {
    const potentialJapanese = splitMatch[1] + '。';
    const potentialChinese = splitMatch[2].trim();

    // Heuristic: if the second part contains Chinese-specific characters, it's Chinese
    const hasChineseChars = /[一-鿿]/.test(potentialChinese);
    // Japanese also has kanji... but the ratio matters
    if (hasChineseChars && potentialChinese.length > 0) {
      japanese = potentialJapanese;
      chinese = potentialChinese;
    }
  }

  return { speaker, japanese: japanese.trim(), chinese: chinese.trim() };
}

function parseOption(optionLine) {
  // e.g. "1. ではここで待（ま）っています。那我在这里等着（误，社长在叫你）"
  // or   "1. ではここで待（ま）っています。那我在这里等着 ✅"
  const match = optionLine.match(/^(\d)\.(.+)$/);
  if (!match) return null;

  const label = match[1];
  const text = match[2].trim();
  const isCorrect = text.includes('✅');
  const cleanText = text.replace('✅', '').trim();

  // Separate Japanese from Chinese explanation
  let japanese = cleanText;
  let chinese = '';

  // Try to split at the boundary between Japanese and Chinese
  // Japanese ends with kana/kanji, Chinese part follows
  const splitMatch = cleanText.match(/^(.+?)[。，,](.+)$/);
  if (splitMatch) {
    const potentialJapanese = splitMatch[1] + '。';
    const potentialChinese = splitMatch[2].trim();
    // Only treat as Chinese if it has substantial Chinese content
    if (potentialChinese.length > 0 && /[一-鿿]/.test(potentialChinese)) {
      japanese = potentialJapanese;
      chinese = potentialChinese;
      // Clean up Chinese: remove parenthetical notes like （误）or （误解xxx）
      chinese = chinese.replace(/[（(]误[，,].*?[）)]/g, '').replace(/[（(]误[）)]/g, '').trim();
    }
  }

  return { label, japanese: japanese.trim(), chinese, isCorrect };
}

function isGrammarLine(line) {
  return line.startsWith('- ') && !line.match(/^\d\./);
}

function isOptionLine(line) {
  return /^\d\./.test(line);
}

function isQuestionLine(line) {
  return /\*\*\d+番\*\*/.test(line);
}

function isSessionHeader(line) {
  return /^###\s+(\d{4})(\d{2})/.test(line);
}

function flushQuestion() {
  if (!currentQuestion || !currentSession) return;

  // Filter grammar to only real grammar lines
  currentQuestion.grammar = pendingGrammar
    .filter(g => g.startsWith('- '))
    .map(g => g.replace(/^- /, '').trim());

  sessions[currentSession].questions.push(currentQuestion);
  currentQuestion = null;
  pendingGrammar = [];
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Skip empty lines
  if (line.trim() === '') continue;

  // Session header: ### 201607
  if (isSessionHeader(line)) {
    if (currentQuestion) flushQuestion();

    const match = line.match(/^###\s+(\d{4})(\d{2})/);
    const sessionId = match[1] + match[2];
    currentSession = sessionId;
    sessions[sessionId] = {
      year: parseInt(match[1]),
      month: parseInt(match[2]),
      questions: [],
    };
    mode = 'idle';
    continue;
  }

  if (!currentSession) continue;

  // Question line: **1番**　女：...
  if (isQuestionLine(line)) {
    if (currentQuestion) flushQuestion();

    const numMatch = line.match(/\*\*(\d+)番\*\*/);
    const number = parseInt(numMatch[1]);

    const dialogue = parseDialogue(line);

    currentQuestion = {
      id: `${currentSession}-${number}`,
      number,
      dialogue,
      options: [],
      grammar: [],
    };
    pendingGrammar = [];
    mode = 'grammar';
    continue;
  }

  if (!currentQuestion) continue;

  // Grammar notes or continuation lines
  if (mode === 'grammar') {
    if (isOptionLine(line)) {
      mode = 'options';
      // Fall through to option handling
    } else {
      // Could be a grammar line or continuation
      if (isGrammarLine(line)) {
        pendingGrammar.push(line);
      } else if (line.trim().startsWith('- ') || line.trim().startsWith('    - ')) {
        // Continuation grammar (indented)
        const trimmed = line.trim();
        if (pendingGrammar.length > 0) {
          pendingGrammar[pendingGrammar.length - 1] += ' ' + trimmed.replace(/^- /, '');
        } else {
          pendingGrammar.push(trimmed);
        }
      }
      continue;
    }
  }

  // Options
  if (mode === 'options') {
    if (isOptionLine(line)) {
      const option = parseOption(line);
      if (option) {
        currentQuestion.options.push(option);
      }
    } else if (isGrammarLine(line)) {
      // Mixed grammar after options (happens in some questions)
      pendingGrammar.push(line);
    }
  }
}

// Flush last question
if (currentQuestion) flushQuestion();

// Calculate session stats
const sessionList = Object.keys(sessions).sort();
const totalQuestions = sessionList.reduce(
  (sum, id) => sum + sessions[id].questions.length,
  0
);

// Write output
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(sessions, null, 2), 'utf-8');

console.log(`✅ Parsed ${sessionList.length} sessions, ${totalQuestions} questions`);
console.log(`📁 Output: ${outPath}`);

// Print per-session summary
for (const id of sessionList) {
  const s = sessions[id];
  console.log(`  ${id}: ${s.questions.length} questions (${s.year}/${s.month})`);
}
