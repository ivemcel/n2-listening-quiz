import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store/useStore';
import questionsData from '../../data/questions.json';
import timestampsData from '../../data/timestamps.json';
import { getSessionAudioSrc, toSessionRelativeTimestamp } from '../utils/sessionAudio';
import { downloadWrongAudio, downloadWrongQuestionText } from '../utils/downloadAudio';

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
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState(null);

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

  const handleDownload = async () => {
    if (selected.size === 0) return;

    setDownloading(true);
    setDownloadMsg('正在加载音频...');

    // Build export entries with relative timestamps
    const ids = [...selected];
    const entries = [];
    const sessionAudioMap = {};

    for (const id of ids) {
      const entry = questionMap[id];
      if (!entry) continue;

      const sessionId = entry.sessionId;
      const audioSrc = getSessionAudioSrc(sessionId);
      if (audioSrc) {
        sessionAudioMap[sessionId] = audioSrc;
      }

      const absTs = timestampsData[sessionId]?.[entry.question.number];
      const relTs = toSessionRelativeTimestamp(sessionId, absTs);

      entries.push({
        id,
        sessionId,
        year: entry.year,
        month: entry.month,
        number: entry.question.number,
        start: relTs?.start ?? 0,
        end: relTs?.end ?? 0,
        question: entry.question,
      });
    }

    try {
      setDownloadMsg('正在裁剪音频片段...');
      const count = await downloadWrongAudio(entries, sessionAudioMap);
      downloadWrongQuestionText(entries);
      setDownloadMsg(`✅ 已下载 ${count} 道错题的音频合集和题目文本！`);
      setTimeout(() => setDownloadMsg(null), 3000);
    } catch (err) {
      setDownloadMsg(`❌ 导出失败: ${err.message}`);
    } finally {
      setDownloading(false);
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

      {!hasTimestamps && (
        <div className="card bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-800">
            ⚠️ 尚未配置音频时间戳，导出的音频可能为空。请先运行 timestamp-helper 标记时间点。
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
                const hasAudio = !!getSessionAudioSrc(sessionId);
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
                    {!hasAudio && (
                      <span className="text-xs text-red-500 shrink-0">无音频</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Download button */}
      <div className="card space-y-3">
        <p className="text-sm text-gray-600">
          已选择 <span className="font-bold text-primary-600">{selected.size}</span> 道错题
        </p>
        <button
          onClick={handleDownload}
          disabled={downloading || selected.size === 0}
          className={`w-full py-3 rounded-xl font-bold text-white transition-colors ${
            downloading || selected.size === 0
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700'
          }`}
        >
          {downloading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              {downloadMsg || '处理中...'}
            </span>
          ) : (
            '⬇️ 下载错题音频和题目文本'
          )}
        </button>
        {downloadMsg && !downloading && (
          <p className={`text-sm text-center ${downloadMsg.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
            {downloadMsg}
          </p>
        )}
        <p className="text-xs text-gray-400 text-center">
          浏览器将下载 WAV 音频合集，并同时导出对应题目和选项文本
        </p>
      </div>
    </div>
  );
}
