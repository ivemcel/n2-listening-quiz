import { useState, useEffect } from 'react';
import YearSelector from '../components/YearSelector';
import useStore from '../store/useStore';
import questionsData from '../../data/questions.json';

export default function HomePage() {
  const loaded = useStore(s => s.loaded);
  const getSessionStats = useStore(s => s.getSessionStats);
  const resetAll = useStore(s => s.resetAll);
  const [sessions, setSessions] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    try {
      setSessions(questionsData);
    } catch (e) {
      setLoadError('题目数据加载失败，请先运行: node scripts/parse.js');
    }
  }, []);

  if (loadError) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600 mb-4">⚠️ {loadError}</p>
        <button onClick={() => window.location.reload()} className="btn-secondary">
          重试
        </button>
      </div>
    );
  }

  if (!sessions || !loaded) {
    return <div className="text-center py-12 text-gray-400">加载中…</div>;
  }

  const sessionIds = Object.keys(sessions);
  const totalQuestions = sessionIds.reduce((s, id) => s + sessions[id].questions.length, 0);
  const sessionCount = sessionIds.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          共 {sessionCount} 场 · {totalQuestions} 题
        </div>
        <button
          onClick={() => {
            if (confirm('确定要重置所有答题记录吗？此操作不可撤销。')) {
              resetAll();
            }
          }}
          className="text-xs text-gray-400 hover:text-red-500 underline"
        >
          重置记录
        </button>
      </div>

      <YearSelector sessions={sessions} getSessionStats={getSessionStats} />

      {sessionIds.length === 0 && (
        <div className="card text-center py-12 text-gray-400">
          暂无数据，请先运行 parse 脚本
        </div>
      )}
    </div>
  );
}
