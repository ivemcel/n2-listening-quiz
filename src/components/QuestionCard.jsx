import { useState, useEffect } from 'react';

export default function QuestionCard({ dialogue, grammar }) {
  const [showDialogue, setShowDialogue] = useState(false);
  const [showFurigana, setShowFurigana] = useState(false);
  const [showChinese, setShowChinese] = useState(false);
  const [showGrammar, setShowGrammar] = useState(false);

  // 切换题目时重置隐藏状态
  useEffect(() => {
    setShowDialogue(false);
    setShowFurigana(false);
    setShowChinese(false);
    setShowGrammar(false);
  }, [dialogue]);

  // Strip furigana for clean display
  const cleanJapanese = dialogue.japanese.replace(/[（(][^)）]*[)）]/g, '');

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded font-medium">
          对话
        </span>
        <span>{dialogue.speaker === '男' ? '🧑' : '👩'} {dialogue.speaker}</span>
      </div>

      {!showDialogue && (
        <button
          onClick={() => setShowDialogue(true)}
          className="text-sm text-primary-600 hover:underline py-2"
        >
          👁 显示句子（先听后练）
        </button>
      )}

      {showDialogue && (
        <>
          {/* Japanese */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">原文</span>
              <button
                onClick={() => setShowFurigana(!showFurigana)}
                className="text-xs text-primary-600 hover:underline"
              >
                {showFurigana ? '隐藏假名' : '显示假名'}
              </button>
            </div>
            <p className="text-lg leading-relaxed text-gray-800">
              {showFurigana ? dialogue.japanese : cleanJapanese}
            </p>
          </div>

          {/* Chinese translation */}
          {dialogue.chinese && (
            <div>
              <button
                onClick={() => setShowChinese(!showChinese)}
                className="text-xs text-primary-600 hover:underline mb-1"
              >
                {showChinese ? '隐藏翻译' : '显示翻译'}
              </button>
              {showChinese && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mt-1">
                  {dialogue.chinese}
                </p>
              )}
            </div>
          )}

          {/* Grammar notes */}
          {grammar && grammar.length > 0 && (
            <div>
              <button
                onClick={() => setShowGrammar(!showGrammar)}
                className="text-xs text-primary-600 hover:underline mb-1"
              >
                {showGrammar ? '隐藏语法' : '语法解析'}
              </button>
              {showGrammar && (
                <ul className="text-sm text-gray-600 bg-amber-50 rounded-lg p-3 space-y-1 mt-1">
                  {grammar.map((g, i) => (
                    <li key={i}>• {g}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
