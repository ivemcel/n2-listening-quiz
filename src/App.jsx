import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, signOut } from './lib/auth';
import HomePage from './pages/HomePage';
import QuizPage from './pages/QuizPage';
import ReviewPage from './pages/ReviewPage';
import ExportPage from './pages/ExportPage';
import AuthPage from './pages/AuthPage';
import NavBar from './components/NavBar';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center text-gray-400">
        <div className="text-4xl mb-2 animate-pulse">🎧</div>
        <p>加载中…</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  // Not logged in → show auth page
  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700">
            🎧 N2听力即时问答
          </h1>
          <p className="text-gray-500 mt-1">历年真题 · 即时答题 · 错题收藏</p>
        </header>
        <Routes>
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </div>
    );
  }

  // Logged in → full app
  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 pt-6">
      <header className="text-center mb-8 relative">
        <h1 className="text-3xl font-bold text-primary-700">
          🎧 N2听力即时问答
        </h1>
        <p className="text-gray-500 mt-1">历年真题 · 即时答题 · 错题收藏</p>
        <div className="absolute top-0 right-0 flex items-center gap-3">
          <span className="text-xs text-gray-400 truncate max-w-[160px]">{user.email}</span>
          <button
            onClick={() => signOut()}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            退出
          </button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/quiz/:sessionId" element={<QuizPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/export" element={<ExportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <NavBar />
    </div>
  );
}
