/**
 * Fix truncated Japanese text issues across all sessions.
 * Patterns:
 * 1. Chinese field has kana → Japanese text leaked in, need to split
 * 2. Option Chinese is empty → flag for later
 */

const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/questions.json', 'utf8'));

let fixes = 0;

for (const [sid, session] of Object.entries(data)) {
  for (const q of session.questions) {

    // Fix 1: DIALOGUE chinese has kana
    // Pattern: the chinese field has Japanese text at the start/end
    // e.g. "練習したかいがあったね。林，我听了你的演讲。练习没白费呢。"
    // Split: Japanese part → append to japanese, Chinese part → keep in chinese
    if (/[぀-ゟ]/.test(q.dialogue.chinese)) {
      const cn = q.dialogue.chinese;
      // Find where Japanese (kana) ends and Chinese begins
      const lastKanaIdx = cn.search(/[一-鿿][　-〿＀-￯]*$/);
      const kanaEnd = cn.search(/[。！？.!?][^぀-ゟ]*$/);

      // Simpler: find the last Japanese sentence ending before Chinese starts
      // Japanese sentences end with 。！？
      const parts = cn.match(/(.*[。！？])\s*(.*)/);
      if (parts) {
        const jpPart = parts[1].trim();
        const cnPart = (parts[2] || '').trim();

        // Verify jpPart has kana (is actually Japanese)
        if (/[぀-ゟ]/.test(jpPart) && cnPart.length > 0) {
          const oldJp = q.dialogue.japanese;
          const oldCn = q.dialogue.chinese;
          q.dialogue.japanese = oldJp + jpPart;
          q.dialogue.chinese = cnPart;
          console.log(`✅ ${sid}#${q.number} DIALOGUE: +"${jpPart.slice(0,20)}…"`);
          fixes++;
        }
      }
    }

    for (const o of q.options) {
      // Fix 2: OPTION chinese has kana
      // Common pattern: "そうしてみます。明白了，我试试看" → just keep the Chinese part
      if (/[぀-ゟ]/.test(o.chinese)) {
        const cn = o.chinese;
        // Split at the boundary between Japanese and Chinese
        // Look for pattern: Japanese sentence ending with 。 followed by Chinese
        const match = cn.match(/^([　-ヿ぀-ゟ一-鿿㐀-䶿豈-﫿ー、。！？…　]*?[。！？])\s*(.+)$/);
        if (match) {
          const possibleJp = match[1].trim();
          const remainingCn = match[2].trim();
          // Only fix if the remaining part has actual Chinese content (not just annotation)
          if (remainingCn.length > 2 && !/^[（(]/.test(remainingCn)) {
            const oldCn = o.chinese;
            o.chinese = remainingCn;
            console.log(`✅ ${sid}#${q.number} OPT${o.label}: cn "${oldCn.slice(0,30)}…" → "${remainingCn.slice(0,30)}…"`);
            fixes++;
          } else {
            // Keep annotation but remove the Japanese prefix
            // e.g. "そうしてみます。明白了，我试试看（当作建议，误）"
            // → "明白了，我试试看（当作建议，误）"
            const cleanPart = cn.replace(/^[　-ヿ぀-ゟ一-鿿ー、。！？…]*?([一-鿿])/, '$1');
            if (cleanPart !== cn && cleanPart.length > 2) {
              o.chinese = cleanPart;
              console.log(`✅ ${sid}#${q.number} OPT${o.label}: cleaned cn → "${cleanPart.slice(0,30)}…"`);
              fixes++;
            }
          }
        }
      }

      // Fix 3: OPTION chinese is empty or japanese has chinese mixed in
      // For now, just log — needs manual review
      if (!o.chinese || o.chinese.trim().length === 0) {
        // Check if japanese has mixed content
        const jpText = o.japanese;
        const cnInJp = jpText.match(/[。！？]([一-鿿＀-￯\，\、\：]+)$/);
        if (cnInJp) {
          const chinesePart = cnInJp[1].trim();
          if (chinesePart.length > 1) {
            o.japanese = jpText.replace(cnInJp[0], '。');
            o.chinese = chinesePart;
            console.log(`✅ ${sid}#${q.number} OPT${o.label}: split jp→cn: "${chinesePart.slice(0,30)}"`);
            fixes++;
          }
        } else {
          console.log(`⚠️ ${sid}#${q.number} OPT${o.label}: chinese为空, japanese="${jpText.slice(0,40)}…"`);
        }
      }
    }
  }
}

fs.writeFileSync('./data/questions.json', JSON.stringify(data, null, 2), 'utf8');
console.log(`\n🎉 共修复 ${fixes} 处`);
