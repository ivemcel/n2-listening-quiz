import { Link } from 'react-router-dom';

const CIRCLE_COLORS = {
  completed: 'bg-green-500 text-white',
  partial: 'bg-amber-500 text-white',
  empty: 'bg-gray-200 text-gray-500',
};

function StatusCircle({ stats }) {
  const status = stats.completed ? 'completed' : stats.answered > 0 ? 'partial' : 'empty';
  const icon = stats.completed ? '✓' : stats.answered > 0 ? '…' : '—';
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${CIRCLE_COLORS[status]}`}>
      {icon}
    </span>
  );
}

export default function YearSelector({ sessions, getSessionStats }) {
  // Group sessions by year
  const years = {};
  for (const [id, session] of Object.entries(sessions)) {
    const y = session.year;
    if (!years[y]) years[y] = [];
    years[y].push({ id, ...session });
  }

  const sortedYears = Object.keys(years).sort();

  return (
    <div className="space-y-6">
      {sortedYears.map(year => {
        const entries = years[year].sort((a, b) => a.month - b.month);
        return (
          <div key={year}>
            <h2 className="text-xl font-bold text-gray-700 mb-3">{year}年</h2>
            <div className="grid grid-cols-2 gap-3">
              {entries.map(entry => {
                const stats = getSessionStats(entry.id, entry.questions);
                return (
                  <Link
                    key={entry.id}
                    to={`/quiz/${entry.id}`}
                    className="card hover:shadow-md hover:border-primary-200 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-lg text-gray-800">
                        {entry.year}.{entry.month}
                      </span>
                      <StatusCircle stats={stats} />
                    </div>
                    <div className="text-sm text-gray-500 space-y-1">
                      <div>{entry.questions.length} 题</div>
                      {stats.answered > 0 && (
                        <div>
                          <span className="text-green-600 font-medium">{stats.correct}</span>
                          <span className="mx-1">/</span>
                          <span>{stats.answered}</span>
                          {stats.answered > 0 && (
                            <span className="ml-1 text-primary-600">
                              ({stats.accuracy}%)
                            </span>
                          )}
                        </div>
                      )}
                      {stats.completed && (
                        <div className="text-green-600 text-xs">✅ 已完成</div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
