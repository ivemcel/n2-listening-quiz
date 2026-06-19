import { useState, useEffect, useRef } from 'react';
import YearSelector from '../components/YearSelector';
import useStore from '../store/useStore';
import questionsData from '../../data/questions.json';

export default function HomePage() {
  const loadUserData = useStore(s => s.loadUserData);
  const loaded = useStore(s => s.loaded);
  const getSessionStats = useStore(s => s.getSessionStats);
  const resetAll = useStore(s => s.resetAll);
  const exportData = useStore(s => s.exportData);
  const importData = useStore(s => s.importData);
  const [sessions, setSessions] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [importMsg, setImportMsg] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      setSessions(questionsData);
    } catch (e) {
      setLoadError('题目数据加载失败，请先运行: node scripts/parse.js');
    }
    // Load user's answer records from PocketBase
    loadUserData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = () => {
    try {
      const data = exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `n2-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setImportMsg({ type: 'success', text: '✅ 导出成功！' });
      setTimeout(() => setImportMsg(null), 2000);
    } catch (e) {
      setImportMsg({ type: 'error', text: `❌ 导出失败: ${e.message}` });
      setTimeout(() => setImportMsg(null), 3000);
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        // Validate backup format
        if (!data.answers || typeof data.answers !== 'object') {
          throw new Error('无效的备份文件：缺少答题数据');
        }
        if (!Array.isArray(data.wrongBook)) {
          throw new Error('无效的备份文件：缺少错题数据');
        }

        const answerCount = Object.values(data.answers).reduce(
          (sum, s) => sum + Object.keys(s).length, 0
        );

        if (!answerCount && !data.wrongBook.length) {
          setImportMsg({ type: 'warn', text: '⚠️ 备份文件为空，未执行导入' });
          setTimeout(() => setImportMsg(null), 3000);
          return;
        }

        importData(data.answers, data.wrongBook);
        setImportMsg({
          type: 'success',
          text: `✅ 导入成功！恢复 ${answerCount} 条答题记录、${data.wrongBook.length} 道错题`,
        });
        setTimeout(() => setImportMsg(null), 4000);
      } catch (err) {
        setImportMsg({ type: 'error', text: `❌ 导入失败: ${err.message}` });
        setTimeout(() => setImportMsg(null), 4000);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    e.target.value = '';
  };

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
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="text-xs text-gray-400 hover:text-primary-600 underline"
            title="导出答题进度备份"
          >
            导出备份
          </button>
          <button
            onClick={handleImport}
            className="text-xs text-gray-400 hover:text-primary-600 underline"
            title="从备份文件恢复"
          >
            导入备份
          </button>
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
      </div>

      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />

      {importMsg && (
        <div
          className={`text-sm text-center py-2 px-4 rounded-lg ${
            importMsg.type === 'success'
              ? 'bg-green-50 text-green-700'
              : importMsg.type === 'warn'
              ? 'bg-yellow-50 text-yellow-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {importMsg.text}
        </div>
      )}

      <YearSelector sessions={sessions} getSessionStats={getSessionStats} />

      {sessionIds.length === 0 && (
        <div className="card text-center py-12 text-gray-400">
          暂无数据，请先运行 parse 脚本
        </div>
      )}
    </div>
  );
}
