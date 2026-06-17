import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set, get) => ({
      // user answers: { sessionId: { questionNumber: selectedOptionLabel } }
      // selectedOptionLabel is "1", "2", or "3"
      answers: {},

      // wrong book: array of question IDs
      wrongBook: [],

      // Record an answer. Returns true if correct.
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
            // Remove from wrong book if answered correctly this time
            const idx = newWrongBook.indexOf(questionId);
            newWrongBook.splice(idx, 1);
          }

          return { answers: newAnswers, wrongBook: newWrongBook };
        });
      },

      // Remove a question from wrong book (user has mastered it)
      removeFromWrongBook: (questionId) => {
        set(state => ({
          wrongBook: state.wrongBook.filter(id => id !== questionId),
        }));
      },

      // Clear all answers for a session
      clearSession: (sessionId) => {
        set(state => {
          const newAnswers = { ...state.answers };
          delete newAnswers[sessionId];
          return { answers: newAnswers };
        });
      },

      // Get answer for a specific question, returns selected label or null
      getAnswer: (sessionId, questionNumber) => {
        const state = get();
        return state.answers[sessionId]?.[questionNumber] ?? null;
      },

      // Get session stats
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

      // Reset all data
      resetAll: () => {
        set({ answers: {}, wrongBook: [] });
      },
    }),
    {
      name: 'n2-listening-store',
      version: 1,
    }
  )
);

export default useStore;
