import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp } from '../lib/auth';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      navigate('/');
    } catch (err) {
      const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      setError(msg.includes('email') ? '邮箱格式不正确或已注册' :
             msg.includes('password') ? '密码至少需要10位字符' :
             msg.includes('identity') ? '邮箱或密码错误' :
             '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-primary-700">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            PocketBase · 多设备同步
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">邮箱</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">密码</label>
            <input
              type="password"
              required
              minLength={10}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400 text-sm"
              placeholder="至少 10 位"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>

          <div className="text-center text-sm text-gray-400">
            {mode === 'login' ? (
              <>还没有账号？<button type="button" onClick={() => setMode('register')} className="text-primary-600 hover:underline font-medium">立即注册</button></>
            ) : (
              <>已有账号？<button type="button" onClick={() => setMode('login')} className="text-primary-600 hover:underline font-medium">返回登录</button></>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
