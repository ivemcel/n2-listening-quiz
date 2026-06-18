#!/usr/bin/env node
/**
 * Export wrong-answer audio segments from the full audio file.
 *
 * Reads export data from localStorage (set by the Export page) or a JSON file,
 * then uses ffmpeg to extract and concatenate the wrong-answer audio segments.
 *
 * Usage:
 *   1. In the web app, go to Export page, select questions, click "Copy Command"
 *   2. Paste into terminal, OR:
 *      node scripts/export-wrong-audio.mjs
 *
 *   Or with explicit question IDs:
 *      node scripts/export-wrong-audio.mjs 201607-1 201707-5 201812-3
 */

import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const AUDIO_SRC = path.join(ROOT, 'public', 'audio', 'n2_full.mp3');
const TIMESTAMPS_PATH = path.join(ROOT, 'data', 'timestamps.json');
const QUESTIONS_PATH = path.join(ROOT, 'data', 'questions.json');
const OUT_DIR = path.join(ROOT, 'data', 'exports');
const OUT_AUDIO = path.join(ROOT, 'data', '错题合集.mp3');
const SEGMENTS_DIR = path.join(OUT_DIR, 'segments');

function stripFurigana(text = '') {
  return text.replace(/[（(][^)）]*[)）]/g, '');
}

// Check ffmpeg availability
function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Load data
function loadData() {
  if (!fs.existsSync(AUDIO_SRC)) {
    console.error('❌ Audio file not found:', AUDIO_SRC);
    console.error('   Run: bash scripts/extract-audio.sh');
    process.exit(1);
  }

  if (!fs.existsSync(TIMESTAMPS_PATH)) {
    console.error('❌ Timestamps not found:', TIMESTAMPS_PATH);
    console.error('   Run: bash scripts/detect-silence.sh');
    process.exit(1);
  }

  if (!fs.existsSync(QUESTIONS_PATH)) {
    console.error('❌ Questions data not found:', QUESTIONS_PATH);
    console.error('   Run: node scripts/parse.js');
    process.exit(1);
  }

  const timestamps = JSON.parse(fs.readFileSync(TIMESTAMPS_PATH, 'utf-8'));
  const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));

  return { timestamps, questions };
}

// Get question IDs to export
function getExportIds(args) {
  // If IDs passed as command line args, use those
  if (args.length > 0) {
    return args;
  }

  // Try reading from the n2-export-data file
  const exportDataPath = path.join(ROOT, 'data', 'export_data.json');
  if (fs.existsSync(exportDataPath)) {
    const data = JSON.parse(fs.readFileSync(exportDataPath, 'utf-8'));
    return data.questionIds || [];
  }

  // Try reading export data from a temp file written by the browser
  console.log('💡 提示：可以通过命令行参数指定要导出的题号');
  console.log('   例如: node scripts/export-wrong-audio.mjs 201607-1 201707-5');
  console.log('');
  console.log('   也可以将错题ID写入 data/export_data.json：');
  console.log('   { "questionIds": ["201607-1", "201707-5"] }');
  return [];
}

// Build lookup: questionId → { sessionId, number }
function buildQuestionLookup(questions) {
  const lookup = {};
  for (const [sessionId, session] of Object.entries(questions)) {
    for (const q of session.questions) {
      lookup[q.id] = {
        sessionId,
        year: session.year,
        month: session.month,
        number: q.number,
        question: q,
      };
    }
  }
  return lookup;
}

function formatQuestionText(seg, index) {
  const question = seg.question;
  const correct = question.options.find(opt => opt.isCorrect);
  const lines = [
    `${index + 1}. ${seg.id}`,
    `场次: ${seg.year}.${seg.month} (${seg.sessionId})`,
    `题号: 第${seg.number}题`,
    '',
    `题目原文: ${question.dialogue.speaker ? `${question.dialogue.speaker}: ` : ''}${stripFurigana(question.dialogue.japanese)}`,
  ];

  if (question.dialogue.japanese !== stripFurigana(question.dialogue.japanese)) {
    lines.push(`题目原文（含假名）: ${question.dialogue.japanese}`);
  }

  if (question.dialogue.chinese) {
    lines.push(`题目翻译: ${question.dialogue.chinese}`);
  }

  lines.push('', '选项:');
  question.options.forEach(opt => {
    const marker = opt.isCorrect ? ' [正确]' : '';
    lines.push(`${opt.label}. ${stripFurigana(opt.japanese)}${marker}`);
    if (opt.japanese !== stripFurigana(opt.japanese)) {
      lines.push(`   含假名: ${opt.japanese}`);
    }
    if (opt.chinese) {
      lines.push(`   翻译: ${opt.chinese}`);
    }
  });

  if (correct) {
    lines.push('', `正确答案: ${correct.label}`);
  }

  if (question.grammar?.length) {
    lines.push('', '语法点:');
    question.grammar.forEach(item => lines.push(`- ${item}`));
  }

  return lines.join('\n');
}

// Main export function
async function main() {
  console.log('🎧 N2 错题音频导出工具\n');

  if (!checkFfmpeg()) {
    console.error('❌ 未找到 ffmpeg，请先安装: brew install ffmpeg');
    process.exit(1);
  }

  const { timestamps, questions } = loadData();
  const lookup = buildQuestionLookup(questions);

  // Get question IDs (from args or data file)
  const ids = getExportIds(process.argv.slice(2));

  if (ids.length === 0) {
    console.error('❌ 没有指定要导出的题目。');
    console.error('   用法: node scripts/export-wrong-audio.mjs <questionId1> <questionId2> ...');
    process.exit(1);
  }

  // Resolve timestamps
  const segments = [];
  const missing = [];

  for (const id of ids) {
    const info = lookup[id];
    if (!info) {
      console.warn(`  ⚠️  未找到题目: ${id}`);
      continue;
    }

    const sessionTs = timestamps[info.sessionId];
    if (!sessionTs || !sessionTs[info.number]) {
      missing.push(id);
      continue;
    }

    const ts = sessionTs[info.number];
    segments.push({
      id,
      sessionId: info.sessionId,
      year: info.year,
      month: info.month,
      number: info.number,
      question: info.question,
      start: ts.start,
      end: ts.end,
    });
  }

  if (missing.length > 0) {
    console.warn(`⚠️  ${missing.length} 道题缺少时间戳，将被跳过:`);
    missing.forEach(id => console.warn(`   - ${id}`));
  }

  if (segments.length === 0) {
    console.error('❌ 没有可导出的音频段。请先配置时间戳。');
    process.exit(1);
  }

  console.log(`📋 准备导出 ${segments.length} 道错题的音频：`);
  segments.forEach(seg => {
    const dur = (seg.end - seg.start).toFixed(1);
    console.log(`   ${seg.id} (第${seg.number}题) — ${seg.start.toFixed(1)}s ~ ${seg.end.toFixed(1)}s (${dur}s)`);
  });

  // Create temp directory for segments
  fs.mkdirSync(SEGMENTS_DIR, { recursive: true });

  // Extract each segment
  console.log('\n🔪 正在裁剪音频片段...');
  const segmentFiles = [];

  for (const seg of segments) {
    const outFile = path.join(SEGMENTS_DIR, `${seg.id}.mp3`);
    const duration = seg.end - seg.start;

    try {
      execFileSync('ffmpeg', [
        '-ss', seg.start.toFixed(2),
        '-i', AUDIO_SRC,
        '-t', duration.toFixed(2),
        '-acodec', 'libmp3lame',
        '-b:a', '192k',
        '-y',
        outFile,
      ], { stdio: 'pipe' });
      segmentFiles.push(outFile);
      console.log(`   ✅ ${seg.id}`);
    } catch (err) {
      console.error(`   ❌ ${seg.id}: ${err.message}`);
    }
  }

  // Create concat file for ffmpeg
  const concatFile = path.join(SEGMENTS_DIR, 'concat.txt');
  const concatContent = segmentFiles
    .map(f => `file '${f}'`)
    .join('\n');
  fs.writeFileSync(concatFile, concatContent);

  // Concatenate all segments
  console.log('\n🔗 正在合并音频...');
  try {
    execFileSync('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-acodec', 'libmp3lame',
      '-b:a', '192k',
      '-y',
      OUT_AUDIO,
    ], { stdio: 'pipe' });
    console.log(`✅ 导出完成: ${OUT_AUDIO}`);
  } catch (err) {
    console.error(`❌ 合并失败: ${err.message}`);

    // If concat fails, just copy the first segment as fallback
    if (segmentFiles.length === 1) {
      fs.copyFileSync(segmentFiles[0], OUT_AUDIO);
      console.log(`✅ 已复制单段音频到: ${OUT_AUDIO}`);
    }
  }

  // Generate a summary file
  const summary = segments.map((seg, i) => {
    const dur = (seg.end - seg.start).toFixed(1);
    return `${i + 1}. ${seg.id} [${seg.start.toFixed(1)}s-${seg.end.toFixed(1)}s, ${dur}s]`;
  }).join('\n');

  const summaryPath = path.join(ROOT, 'data', '错题导出记录.txt');
  const questionText = segments.map(formatQuestionText).join('\n\n------------------------------\n\n');
  fs.writeFileSync(
    summaryPath,
    `错题音频导出记录\n导出时间: ${new Date().toISOString()}\n共 ${segments.length} 题\n\n音频片段:\n${summary}\n\n==============================\n\n错题题目和选项\n\n${questionText}\n`
  );
  console.log(`📝 导出记录: ${summaryPath}`);

  // Cleanup
  fs.rmSync(SEGMENTS_DIR, { recursive: true, force: true });
  console.log('\n🎉 全部完成！');
}

main().catch(err => {
  console.error('❌ 导出失败:', err.message);
  process.exit(1);
});
