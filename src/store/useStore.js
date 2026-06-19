import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { tryRecover, writeBackup } from '../utils/dataBackup';

// ─── Pre-initialization recovery ────────────────────────────
// If primary localStorage was wiped, restore from backup/snapshot
// BEFORE zustand's persist middleware reads from it.

let recoveredFrom = null;
try {
  const result = tryRecover();
  if (result.recovered) {
    recoveredFrom = result.source;
  }
} catch {
  // localStorage unavailable — app will work in-memory
}

// ─── Store ──────────────────────────────────────────────────

const useStore = create(
  persist(
    (set, get) => ({
      // user answers: { sessionId: { questionNumber: selectedOptionLabel } }
      answers: {},

      // wrong book: array of question IDs
      wrongBook: [],

      // ─── Record an answer ───────────────────────────────

      recordAnswer: (questionId, sessionId, questionNumber, selectedLabel, isCorrect) => {
        set(state => {
          const newAnswers = { ...state.answers };
          if (!newAnswers[sessionId]) {
            newAnswers[sessionId] = {};
          }
          newAnswers[sessionId][questionNumber] = selectedLabel;

          const newWrongBook = [...state.wrongBook];
          if (!isCorrect && !newWrongBook.includes(questionId)) {
            newWrongBook.push(questionId);
          } else if (isCorrect && newWrongBook.includes(questionId)) {
            const idx = newWrongBook.indexOf(questionId);
            newWrongBook.splice(idx, 1);
          }

          return { answers: newAnswers, wrongBook: newWrongBook };
        });
      },

      // ─── Remove from wrong book ──────────────────────────

      removeFromWrongBook: (questionId) => {
        set(state => ({
          wrongBook: state.wrongBook.filter(id => id !== questionId),
        }));
      },

      // ─── Clear all answers for a session ─────────────────

      clearSession: (sessionId) => {
        set(state => {
          const newAnswers = { ...state.answers };
          delete newAnswers[sessionId];
          return { answers: newAnswers };
        });
      },

      // ─── Get answer for a specific question ──────────────

      getAnswer: (sessionId, questionNumber) => {
        const state = get();
        return state.answers[sessionId]?.[questionNumber] ?? null;
      },

      // ─── Get session stats ───────────────────────────────

      getSessionStats: (sessionId, questions) => {
        const state = get();
        const sessionAnswers = state.answers[sessionId] || {};
        const answeredCount = Object.keys(sessionAnswers).length;
        const correctCount = questions.filter(q => {
          const ans = sessionAnswers[q.number];
          if (!ans) return false;
          const option = q.options.find(o => o.label === ans);
          return option?.isCorrect === true;
        }).length;

        return {
          total: questions.length,
          answered: answeredCount,
          correct: correctCount,
          accuracy: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
          completed: answeredCount === questions.length,
        };
      },

      // ─── Reset all data ──────────────────────────────────

      resetAll: () => {
        set({ answers: {}, wrongBook: [] });
      },

      // ─── Import data from backup file ────────────────────

      importData: (answers, wrongBook) => {
        set(state => ({
          answers: { ...state.answers, ...answers },
          wrongBook: [...new Set([...state.wrongBook, ...wrongBook])],
        }));
      },

      // ─── Export data for backup file ─────────────────────

      exportData: () => {
        const state = get();
        return {
          answers: state.answers,
          wrongBook: state.wrongBook,
          exportedAt: new Date().toISOString(),
        };
      },
    }),
    {
      name: 'n2-listening-store',
      version: 2, // bumped to trigger clean migration
      onRehydrateStorage: () => {
        // Return callback that fires after hydration
        return (state) => {
          if (state && recoveredFrom) {
            // Show a one-time notification in console
            console.log(`🛟 答题数据已从「${recoveredFrom}」自动恢复`);
            // Reset after showing
            recoveredFrom = null;
          }
          // Write initial backup after hydration
          writeBackup();
        };
      },
    }
  )
);

// ─── Auto-backup on every state change ─────────────────────
// Debounce writes: at most once per 2 seconds

let backupTimer = null;
useStore.subscribe(() => {
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    writeBackup();
  }, 2000);
});

// ─── Recovery status getter ─────────────────────────────────

export function wasDataRecovered() {
  return recoveredFrom;
}

export default useStore;
