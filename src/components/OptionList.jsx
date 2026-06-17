import { useState, useEffect } from 'react';

export default function OptionList({ options, selectedLabel, onSelect, disabled, showResult }) {
  const [showJapanese, setShowJapanese] = useState({});
  const [showChinese, setShowChinese] = useState({});

  // 答完后自动显示所有选项的日文和翻译
  useEffect(() => {
    if (showResult) {
      const all = {};
      options.forEach(opt => { all[opt.label] = true; });
      setShowJapanese(all);
      setShowChinese(all);
    }
  }, [showResult, options]);

  const toggleJapanese = (label) => {
    setShowJapanese(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const toggleChinese = (label) => {
    setShowChinese(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 font-medium">选择回答：</span>
        {!showResult && (
          <button
            onClick={() => {
              const all = {};
              options.forEach(opt => { all[opt.label] = true; });
              setShowJapanese(all);
            }}
            className="text-xs text-primary-600 hover:underline"
          >
            👁 显示全部选项文字
          </button>
        )}
      </div>
      {options.map((opt) => {
        let borderClass = 'border-gray-200 hover:border-primary-400 hover:bg-primary-50';
        if (showResult) {
          if (opt.isCorrect) {
            borderClass = 'border-green-500 bg-green-50';
          } else if (selectedLabel === opt.label && !opt.isCorrect) {
            borderClass = 'border-red-500 bg-red-50';
          }
        } else if (selectedLabel === opt.label) {
          borderClass = 'border-primary-500 bg-primary-50 ring-2 ring-primary-200';
        }

        return (
          <button
            key={opt.label}
            onClick={() => !disabled && onSelect(opt.label)}
            disabled={disabled}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-150 ${borderClass}`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5 ${
                  showResult && opt.isCorrect
                    ? 'bg-green-500 text-white'
                    : showResult && selectedLabel === opt.label && !opt.isCorrect
                    ? 'bg-red-500 text-white'
                    : selectedLabel === opt.label
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {showResult && opt.isCorrect ? '✓' : opt.label}
              </span>
              <div className="flex-1 min-w-0">
                {showJapanese[opt.label] ? (
                  <p className="text-base leading-relaxed text-gray-800">
                    {opt.japanese}
                  </p>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleJapanese(opt.label); }}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    👁 显示选项 {opt.label}
                  </button>
                )}
                {opt.chinese && showJapanese[opt.label] && (
                  <div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleChinese(opt.label); }}
                      className="text-xs text-primary-600 hover:underline mt-1"
                    >
                      {showChinese[opt.label] ? '隐藏翻译' : '显示翻译'}
                    </button>
                    {showChinese[opt.label] && (
                      <p className="text-sm text-gray-500 mt-1">{opt.chinese}</p>
                    )}
                  </div>
                )}
              </div>
              {showResult && opt.isCorrect && (
                <span className="text-green-600 text-lg shrink-0">✅</span>
              )}
              {showResult && selectedLabel === opt.label && !opt.isCorrect && (
                <span className="text-red-600 text-lg shrink-0">❌</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
