import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store/useStore';
import questionsData from '../../data/questions.json';

// Build a lookup map: questionId -> { session, question }
function buildQuestionMap() {
  const map = {};
  for (const [sessionId, session] of Object.entries(questionsData)) {
    for (const q of session.questions) {
      map[q.id] = {
        sessionId,
        year: session.year,
        month: session.month,
        question: q,
      };
    }
  }
  return map;
}

export default function ReviewPage() {
  const wrongBook = useStore(s => s.wrongBook);
  const removeFromWrongBook = useStore(s => s.removeFromWrongBook);
  const answers = useStore(s => s.answers);
  const resetAll = useStore(s => s.resetAll);

  const [filterYear, setFilterYear] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const questionMap = useMemo(() => buildQuestionMap(), []);

  // Filter wrong book by year
  const filteredWrong = wrongBook.filter(id => {
    const entry = questionMap[id];
    if (!entry) return false;
    if (filterYear === 'all') return true;
    return entry.year === parseInt(filterYear);
  });

  // Group by session
  const grouped = useMemo(() => {
    const groups = {};
    for (const id of filteredWrong) {
      const entry = questionMap[id];
      if (!entry) continue;
      const key = entry.sessionId;
      if (!groups[key]) groups[key] = { ...entry, items: [] };
      groups[key].items.push({ id, q: entry.question });
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredWrong, questionMap]);

  // Available years
  const years = useMemo(() => {
    const set = new Set();
    wrongBook.forEach(id => {
      const entry = questionMap[id];
      if (entry) set.add(entry.year);
    });
    return [...set].sort();
  }, [wrongBook, questionMap]);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">📋 错题本</h2>
        {wrongBook.length > 0 && (
          <button
            onClick={() => {
              if (confirm('确定清空所有错题吗？')) resetAll();
            }}
            className="text-xs text-gray-400 hover:text-red-500 underline"
          >
            清空全部
          </button>
        )}
      </div>

      {wrongBook.length === 0 ? (
        <div className="card text-center py-16 space-y-4">
          <div className="text-6xl">🎉</div>
          <p className="text-gray-500 text-lg">没有错题</p>
          <p className="text-gray-400 text-sm">继续保持！</p>
          <Link to="/" className="btn-primary inline-block">
            去答题
          </Link>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="card flex items-center justify-around text-center">
            <div>
              <div className="text-2xl font-bold text-red-500">{wrongBook.length}</div>
              <div className="text-xs text-gray-500">错题总数</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary-600">{years.length}</div>
              <div className="text-xs text-gray-500">涉及年份</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">{Object.keys(grouped).length}</div>
              <div className="text-xs text-gray-500">涉及场次</div>
            </div>
          </div>

          {/* Year filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterYear('all')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filterYear === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              全部
            </button>
            {years.map(y => (
              <button
                key={y}
                onClick={() => setFilterYear(String(y))}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filterYear === String(y)
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Wrong questions list */}
          <div className="space-y-4">
            {grouped.map(([sessionId, group]) => (
              <div key={sessionId} className="card">
                <Link
                  to={`/quiz/${sessionId}`}
                  className="font-bold text-gray-700 hover:text-primary-600 transition-colors"
                >
                  {group.year}.{group.month} · {group.items.length}道错题
                </Link>
                <div className="mt-3 space-y-2">
                  {group.items.map(({ id, q }) => {
                    const isExpanded = expandedId === id;
                    const userAnswer = answers[sessionId]?.[q.number];
                    return (
                      <div
                        key={id}
                        className="border border-gray-100 rounded-xl overflow-hidden"
                      >
                        <button
                          onClick={() => toggleExpand(id)}
                          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded">
                              第{q.number}题
                            </span>
                            <span className="text-sm text-gray-700 truncate max-w-[200px]">
                              {q.dialogue.japanese.replace(/[（(][^)）]*[)）]/g, '').slice(0, 40)}…
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {userAnswer && (
                              <span className="text-xs text-red-500">
                                选了 {userAnswer}
                              </span>
                            )}
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-2">
                            <p className="text-sm text-gray-800">
                              <span className="text-gray-400">{q.dialogue.speaker}：</span>
                              {q.dialogue.japanese}
                            </p>
                            {q.dialogue.chinese && (
                              <p className="text-xs text-gray-500">{q.dialogue.chinese}</p>
                            )}
                            <div className="space-y-1">
                              {q.options.map(o => (
                                <div
                                  key={o.label}
                                  className={`text-sm p-2 rounded-lg ${
                                    o.isCorrect
                                      ? 'bg-green-100 text-green-800'
                                      : o.label === userAnswer
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-white text-gray-600'
                                  }`}
                                >
                                  <span className="font-bold mr-2">{o.label}.</span>
                                  {o.japanese}
                                  {o.isCorrect && ' ✅'}
                                  {o.label === userAnswer && !o.isCorrect && ' ❌'}
                                </div>
                              ))}
                            </div>
                            {q.grammar && q.grammar.length > 0 && (
                              <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg">
                                {q.grammar.map((g, i) => (
                                  <div key={i}>• {g}</div>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => removeFromWrongBook(id)}
                              className="text-xs text-green-600 hover:underline"
                            >
                              ✓ 已掌握，移出错题本
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
