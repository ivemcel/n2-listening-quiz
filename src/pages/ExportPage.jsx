import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store/useStore';
import questionsData from '../../data/questions.json';
import timestampsData from '../../data/timestamps.json';

function buildQuestionMap() {
  const map = {};
  for (const [sessionId, session] of Object.entries(questionsData)) {
    for (const q of session.questions) {
      map[q.id] = { sessionId, year: session.year, month: session.month, question: q };
    }
  }
  return map;
}

export default function ExportPage() {
  const wrongBook = useStore(s => s.wrongBook);
  const questionMap = useMemo(() => buildQuestionMap(), []);

  const [selected, setSelected] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [copied, setCopied] = useState(false);

  // Group wrong questions by session
  const grouped = useMemo(() => {
    const groups = {};
    for (const id of wrongBook) {
      const entry = questionMap[id];
      if (!entry) continue;
      const key = entry.sessionId;
      if (!groups[key]) groups[key] = { year: entry.year, month: entry.month, items: [] };
      groups[key].items.push({ id, q: entry.question });
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [wrongBook, questionMap]);

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
    } else {
      setSelected(new Set(wrongBook));
      setSelectAll(true);
    }
  };

  const toggleOne = (id) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
    setSelectAll(next.size === wrongBook.length);
  };

  // Generate export data for the shell script
  const generateExportCommand = () => {
    const ids = [...selected];
    const entries = ids.map(id => {
      const entry = questionMap[id];
      const ts = timestampsData[entry.sessionId]?.[entry.question.number];
      return {
        id,
        sessionId: entry.sessionId,
        number: entry.question.number,
        start: ts?.start ?? 0,
        end: ts?.end ?? 0,
      };
    });

    // Write export data to localStorage so the script can read it
    const exportData = {
      questionIds: ids,
      entries,
      exportedAt: new Date().toISOString(),
    };
    localStorage.setItem('n2-export-data', JSON.stringify(exportData));

    return `node scripts/export-wrong-audio.mjs`;
  };

  const handleCopyCommand = async () => {
    const cmd = generateExportCommand();
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (wrongBook.length === 0) {
    return (
      <div className="card text-center py-16 space-y-4">
        <div className="text-6xl">📭</div>
        <p className="text-gray-500 text-lg">没有错题可导出</p>
        <Link to="/" className="btn-primary inline-block">
          去答题
        </Link>
      </div>
    );
  }

  const hasTimestamps = Object.keys(timestampsData).length > 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">💾 导出错题音频</h2>

      {/* Info */}
      <div className="card bg-blue-50 border-blue-200 space-y-2">
        <p className="text-sm text-blue-800">
          📌 导出需要用到 ffmpeg。请确保已安装 ffmpeg。
        </p>
        <p className="text-sm text-blue-700">
          选择要导出的错题，然后在终端运行导出命令。
        </p>
      </div>

      {!hasTimestamps && (
        <div className="card bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-800">
            ⚠️ 尚未配置音频时间戳。请先运行 timestamp-helper 标记时间点，否则导出的音频将为空。
          </p>
        </div>
      )}

      {/* Select all */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={selectAll}
            onChange={toggleSelectAll}
            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">
            全选 ({selected.size}/{wrongBook.length})
          </span>
        </label>
      </div>

      {/* Question list */}
      <div className="space-y-3">
        {grouped.map(([sessionId, group]) => (
          <div key={sessionId} className="card">
            <h3 className="font-bold text-gray-700 mb-2">
              {group.year}.{group.month}
            </h3>
            <div className="space-y-1">
              {group.items.map(({ id, q }) => {
                const hasTs = !!timestampsData[sessionId]?.[q.number];
                return (
                  <label
                    key={id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={() => toggleOne(id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                    />
                    <span className="text-sm text-gray-500 shrink-0">第{q.number}题</span>
                    <span className="text-sm text-gray-700 truncate flex-1">
                      {q.dialogue.japanese.replace(/[（(][^)）]*[)）]/g, '').slice(0, 35)}…
                    </span>
                    {!hasTs && (
                      <span className="text-xs text-orange-500 shrink-0">无时间戳</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Export action */}
      <div className="card space-y-3">
        <p className="text-sm text-gray-600">
          已选择 <span className="font-bold text-primary-600">{selected.size}</span> 道错题
        </p>
        <p className="text-xs text-gray-500">
          在终端中运行以下命令导出音频：
        </p>
        <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-sm font-mono break-all">
          $ {generateExportCommand()}
        </div>
        <button
          onClick={handleCopyCommand}
          className="btn-secondary text-sm"
        >
          {copied ? '✅ 已复制' : '📋 复制命令'}
        </button>
        <p className="text-xs text-gray-400">
          导出文件将保存为 data/错题合集.mp3
        </p>
      </div>
    </div>
  );
}
