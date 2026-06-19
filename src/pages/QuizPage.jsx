import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import AudioPlayer from '../components/AudioPlayer';
import QuestionCard from '../components/QuestionCard';
import OptionList from '../components/OptionList';
import ProgressBar from '../components/ProgressBar';
import useStore from '../store/useStore';
import questionsData from '../../data/questions.json';
import timestampsData from '../../data/timestamps.json';
import { getSessionAudioSrc, toSessionRelativeTimestamp } from '../utils/sessionAudio';

export default function QuizPage() {
  const { sessionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const recordAnswer = useStore(s => s.recordAnswer);
  const getAnswer = useStore(s => s.getAnswer);
  const getSessionStats = useStore(s => s.getSessionStats);
  const clearSession = useStore(s => s.clearSession);
  const loadUserData = useStore(s => s.loadUserData);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [pageReady, setPageReady] = useState(false);

  const session = questionsData[sessionId];
  const questions = session?.questions || [];
  const timestamps = timestampsData[sessionId] || {};
  const sessionAudioSrc = getSessionAudioSrc(sessionId);

  // Refresh data from PocketBase when entering a quiz session
  useEffect(() => {
    setPageReady(false);
    loadUserData().then(() => setPageReady(true));
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentIndex(0);
    setSessionDone(false);
  }, [sessionId]);

  // Check if session was completed and handle redo/restart
  useEffect(() => {
    if (!session) return;
    const stats = getSessionStats(sessionId, questions);
    const isRedo = searchParams.get('redo') === '1';
    if (isRedo) {
      // Direct redo from home page: clear and start fresh
      clearSession(sessionId);
      setSearchParams({}, { replace: true });
    } else if (stats.completed) {
      // Completed session: ask user whether to redo or review
      setShowRestartDialog(true);
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestartSession = useCallback(() => {
    clearSession(sessionId);
    setShowRestartDialog(false);
    setCurrentIndex(0);
    setSelectedLabel(null);
    setShowResult(false);
    setSessionDone(false);
  }, [sessionId, clearSession]);

  const handleContinueReview = useCallback(() => {
    setShowRestartDialog(false);
  }, []);

  // Restore previous answer state for current question
  const prevAnswer = getAnswer(sessionId, questions[currentIndex]?.number);

  // Reset state when navigating to a new question
  useEffect(() => {
    setSelectedLabel(null);
    setShowResult(false);
  }, [currentIndex, sessionId]);

  useEffect(() => {
    if (prevAnswer) {
      setSelectedLabel(prevAnswer);
      setShowResult(true);
    }
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = useCallback((label) => {
    if (showResult) return;
    setSelectedLabel(label);
    setShowResult(true);

    const q = questions[currentIndex];
    const option = q.options.find(o => o.label === label);
    recordAnswer(q.id, sessionId, q.number, label, option?.isCorrect === true);
  }, [showResult, currentIndex, questions, sessionId, recordAnswer]);

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      setSessionDone(true);
    }
  }, [currentIndex, questions.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  }, [currentIndex]);

  // Loading state while syncing from PocketBase
  if (!pageReady) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-2 animate-pulse">🔄</div>
        <p>同步答题数据…</p>
      </div>
    );
  }

  // Session not found
  if (!session) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600 mb-4">未找到场次: {sessionId}</p>
        <Link to="/" className="btn-secondary">返回首页</Link>
      </div>
    );
  }

  // Restart dialog — shown when entering a completed session
  if (showRestartDialog) {
    const stats = getSessionStats(sessionId, questions);
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 text-center">
          <div className="text-5xl">📋</div>
          <h2 className="text-xl font-bold text-gray-800">
            {session.year}.{session.month} 已完成
          </h2>
          <div className="flex justify-center gap-6 text-sm">
            <div>
              <span className="text-green-600 font-bold">{stats.correct}</span>
              <span className="text-gray-400"> / {stats.total} 正确</span>
            </div>
            <div>
              <span className="text-primary-600 font-bold">{stats.accuracy}%</span>
              <span className="text-gray-400"> 正确率</span>
            </div>
          </div>
          <div className="space-y-2 pt-2">
            <button
              onClick={handleRestartSession}
              className="w-full py-3 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 transition-colors"
            >
              🔄 清空重做
            </button>
            <button
              onClick={handleContinueReview}
              className="w-full py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              👁 继续查看
            </button>
          </div>
          <p className="text-xs text-gray-400">
            清空重做将清除本场所有答题记录，重新开始
          </p>
          <Link
            to="/"
            className="block text-xs text-gray-400 hover:text-gray-600 underline"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  // Session complete screen
  if (sessionDone) {
    const stats = getSessionStats(sessionId, questions);
    return (
      <div className="card text-center py-12 space-y-6">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-gray-800">本场完成！</h2>
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600">{stats.total}</div>
            <div className="text-sm text-gray-500">总题数</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{stats.correct}</div>
            <div className="text-sm text-gray-500">正确</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-500">{stats.answered - stats.correct}</div>
            <div className="text-sm text-gray-500">错误</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600">{stats.accuracy}%</div>
            <div className="text-sm text-gray-500">正确率</div>
          </div>
        </div>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => {
              clearSession(sessionId);
              setCurrentIndex(0);
              setSessionDone(false);
              setSelectedLabel(null);
              setShowResult(false);
            }}
            className="btn-secondary"
          >
            再做一遍
          </button>
          <Link to="/" className="btn-primary">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  const audioTimestamp = toSessionRelativeTimestamp(sessionId, timestamps[q.number]);
  const hasAudio = Boolean(sessionAudioSrc && audioTimestamp);
  const audioStart = audioTimestamp?.start ?? 0;
  const audioEnd = audioTimestamp?.end ?? null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← 返回
        </Link>
        <h2 className="font-bold text-gray-700">
          {session.year}.{session.month} 即时问答
        </h2>
        <div className="text-sm text-gray-400">{sessionId}</div>
      </div>

      <ProgressBar current={currentIndex + 1} total={questions.length} />

      {/* Audio Player */}
      {hasAudio && (
        <AudioPlayer
          key={sessionId}
          audioSrc={sessionAudioSrc}
          startTime={audioStart}
          endTime={audioEnd}
          autoPlay={false}
        />
      )}
      {!hasAudio && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
          ⚠️ 音频时间戳未配置。请先运行 timestamp-helper 标记时间点。
        </div>
      )}

      {/* Question Number Badge */}
      <div className="flex items-center gap-2">
        <span className="bg-primary-600 text-white text-sm font-bold px-3 py-1 rounded-full">
          第 {q.number} 题
        </span>
        {showResult && (
          <span className={`text-sm font-medium ${q.options.find(o => o.label === selectedLabel)?.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
            {q.options.find(o => o.label === selectedLabel)?.isCorrect ? '✅ 回答正确！' : '❌ 回答错误'}
          </span>
        )}
      </div>

      <QuestionCard dialogue={q.dialogue} grammar={q.grammar} />

      <OptionList
        key={currentIndex}
        options={q.options}
        selectedLabel={selectedLabel}
        onSelect={handleSelect}
        disabled={showResult}
        showResult={showResult}
      />

      {/* Feedback after answering */}
      {showResult && (
        <div className={`p-4 rounded-xl text-sm ${q.options.find(o => o.label === selectedLabel)?.isCorrect ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {q.options.find(o => o.label === selectedLabel)?.isCorrect
            ? '太棒了！继续加油！'
            : '已自动加入错题本，多加练习！'}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="btn-secondary text-sm"
        >
          ← 上一题
        </button>
        {showResult && (
          <button onClick={handleNext} className="btn-primary text-sm">
            {currentIndex < questions.length - 1 ? '下一题 →' : '查看成绩 🎉'}
          </button>
        )}
      </div>
    </div>
  );
}
