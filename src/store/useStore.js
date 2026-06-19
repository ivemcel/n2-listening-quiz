import { create } from 'zustand';
import { pb } from '../lib/pocketbase';

/**
 * Simple data model:
 * - session_progress collection: one record per user per session
 *   { user, session_code, answers: {"1":"3","2":"1",...}, wrong_book: [...] }
 * - All reads/writes are full-document, no ID mapping needed
 */

const useStore = create((set, get) => ({
  answers: {},
  wrongBook: [],
  loaded: false,
  loadError: null,

  // ─── Load ALL progress from PocketBase ────────────────────

  loadUserData: async () => {
    if (!pb.authStore.isValid) {
      set({ loaded: true });
      return;
    }

    try {
      const records = await pb.collection('session_progress').getFullList({
        requestKey: null,
      });

      const answers = {};
      const wrongBook = [];
      for (const r of records) {
        if (r.answers && typeof r.answers === 'object') {
          answers[r.session_code] = r.answers;
        }
      }

      // wrong_book is now per-session too — aggregate from all sessions
      for (const r of records) {
        if (Array.isArray(r.wrong_book)) {
          for (const code of r.wrong_book) {
            if (!wrongBook.includes(code)) wrongBook.push(code);
          }
        }
      }

      console.log(`📥 加载 ${records.length} 个场次进度, ${wrongBook.length} 道错题`);
      set({ answers, wrongBook, loaded: true, loadError: null });
    } catch (err) {
      const msg = err.message || String(err);
      console.error('❌ 加载失败:', msg);
      set({ loaded: true, loadError: msg });
    }
  },

  // ─── Save one session's progress ──────────────────────────

  saveSessionProgress: async (sessionCode) => {
    const state = get();
    const sessionAnswers = state.answers[sessionCode] || {};

    // Determine wrong book entries for this session
    const sessionWrongBook = state.wrongBook.filter(code => code.startsWith(sessionCode));

    try {
      // Find existing record
      const existing = await pb.collection('session_progress').getList(1, 1, {
        filter: `session_code="${sessionCode}"`,
        requestKey: null,
      });

      const data = {
        user: pb.authStore.model.id,
        session_code: sessionCode,
        answers: sessionAnswers,
        wrong_book: sessionWrongBook,
      };

      if (existing.items.length > 0) {
        await pb.collection('session_progress').update(existing.items[0].id, data);
      } else {
        await pb.collection('session_progress').create(data);
      }
      console.log(`💾 ${sessionCode} 已保存:`, sessionAnswers);
    } catch (err) {
      console.error('❌ 保存失败:', err.message);
      throw err;
    }
  },

  // ─── Record an answer ────────────────────────────────────

  recordAnswer: async (questionCode, sessionCode, questionNumber, selectedLabel, isCorrect) => {
    // Update store immediately
    set(state => {
      const newAnswers = { ...state.answers };
      if (!newAnswers[sessionCode]) newAnswers[sessionCode] = {};
      newAnswers[sessionCode][questionNumber] = selectedLabel;

      const newWrongBook = [...state.wrongBook];
      if (!isCorrect && !newWrongBook.includes(questionCode)) {
        newWrongBook.push(questionCode);
      } else if (isCorrect && newWrongBook.includes(questionCode)) {
        newWrongBook.splice(newWrongBook.indexOf(questionCode), 1);
      }

      return { answers: newAnswers, wrongBook: newWrongBook };
    });

    // Save to PocketBase
    await get().saveSessionProgress(sessionCode);
  },

  // ─── Remove from wrong book ──────────────────────────────

  removeFromWrongBook: async (questionCode) => {
    const sessionCode = questionCode.split('-')[0];

    set(state => ({
      wrongBook: state.wrongBook.filter(id => id !== questionCode),
    }));

    try {
      await get().saveSessionProgress(sessionCode);
    } catch (err) {
      console.error('Failed to remove from wrong book:', err.message);
    }
  },

  // ─── Clear session ───────────────────────────────────────

  clearSession: async (sessionCode) => {
    set(state => {
      const newAnswers = { ...state.answers };
      delete newAnswers[sessionCode];
      return { answers: newAnswers };
    });

    try {
      const existing = await pb.collection('session_progress').getList(1, 1, {
        filter: `session_code="${sessionCode}"`,
        requestKey: null,
      });
      if (existing.items.length > 0) {
        await pb.collection('session_progress').update(existing.items[0].id, {
          answers: {},
          wrong_book: [],
        });
      }
    } catch (err) {
      console.error('Failed to clear session:', err.message);
    }
  },

  // ─── Getters ─────────────────────────────────────────────

  getAnswer: (sessionCode, questionNumber) => {
    return get().answers[sessionCode]?.[questionNumber] ?? null;
  },

  getSessionStats: (sessionCode, questions) => {
    const state = get();
    const sessionAnswers = state.answers[sessionCode] || {};
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

  // ─── Reset all ───────────────────────────────────────────

  resetAll: async () => {
    set({ answers: {}, wrongBook: [] });

    try {
      const records = await pb.collection('session_progress').getFullList({ requestKey: null });
      for (const r of records) {
        await pb.collection('session_progress').delete(r.id);
      }
    } catch (err) {
      console.error('Failed to reset:', err.message);
    }
  },

}));

export default useStore;
