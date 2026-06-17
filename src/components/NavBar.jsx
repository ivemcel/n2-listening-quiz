import { NavLink } from 'react-router-dom';
import useStore from '../store/useStore';

export default function NavBar() {
  const wrongCount = useStore(s => s.wrongBook.length);

  const baseClass =
    'flex flex-col items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors';
  const activeClass = 'text-primary-600 bg-primary-50';
  const inactiveClass = 'text-gray-500 hover:text-gray-700';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-4xl mx-auto flex justify-around py-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}
        >
          <span className="text-xl">📝</span>
          <span>答题</span>
        </NavLink>
        <NavLink
          to="/review"
          className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}
        >
          <span className="text-xl relative">
            📋
            {wrongCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {wrongCount > 99 ? '99' : wrongCount}
              </span>
            )}
          </span>
          <span>错题本</span>
        </NavLink>
        <NavLink
          to="/export"
          className={({ isActive }) => `${baseClass} ${isActive ? activeClass : inactiveClass}`}
        >
          <span className="text-xl">💾</span>
          <span>导出</span>
        </NavLink>
      </div>
    </nav>
  );
}
