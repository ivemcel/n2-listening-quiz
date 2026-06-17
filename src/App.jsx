import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import QuizPage from './pages/QuizPage';
import ReviewPage from './pages/ReviewPage';
import ExportPage from './pages/ExportPage';
import NavBar from './components/NavBar';

export default function App() {
  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 pt-6">
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
