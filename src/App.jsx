import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import QuizPage from './pages/QuizPage';
import ReviewPage from './pages/ReviewPage';
import ExportPage from './pages/ExportPage';
import NavBar from './components/NavBar';
import { wasDataRecovered } from './store/useStore';

export default function App() {
  const [dismissRecovery, setDismissRecovery] = useState(false);
  const recoveredFrom = wasDataRecovered();

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 pt-6">
      {/* Data recovery notification */}
      {recoveredFrom && !dismissRecovery && (
        <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-amber-800">
            🛟 检测到数据异常，已从 <span className="font-bold">{recoveredFrom}</span> 自动恢复答题记录。
          </p>
          <button
            onClick={() => setDismissRecovery(true)}
            className="text-amber-500 hover:text-amber-700 ml-3 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <header className="text-center mb-8">
        <h1 className="text-3xl font-bold text-primary-700">
          🎧 N2听力即时问答
        </h1>
        <p className="text-gray-500 mt-1">历年真题 · 即时答题 · 错题收藏</p>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/quiz/:sessionId" element={<QuizPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/export" element={<ExportPage />} />
      </Routes>
      <NavBar />
    </div>
  );
}
