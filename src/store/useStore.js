import { create } from 'zustand';
import { pb, getQuestionPbId, getSessionPbId } from '../lib/pocketbase';

const useStore = create((set, get) => ({
  // ─── Client state ─────────────────────────────────────────

  answers: {},       // { sessionCode: { questionNumber: selectedLabel } }
  wrongBook: [],     // array of question codes
  loaded: false,     // true after data synced from PocketBase

  // ─── Load user data from PocketBase ───────────────────────

  loadUserData: async () => {
    if (!pb.authStore.isValid) {
      set({ loaded: true });
      return;
    }

    try {
      // Fetch answer records (with expanded question for code)
      const records = await pb.collection('answer_records').getFullList({
        expand: 'question',
        requestKey: null,
      });

      const answers = {};
      for (const r of records) {
        const qCode = r.expand?.question?.code;
        if (!qCode) continue;
        const parts = qCode.split('-');
        const sessionCode = parts.slice(0, 2).join('-'); // "201607"
        const qNum = parseInt(parts[parts.length - 1], 10);
        if (!answers[sessionCode]) answers[sessionCode] = {};
        answers[sessionCode][qNum] = r.selected_label;
      }

      // Fetch wrong book
      const wrongRecords = await pb.collection('wrong_book').getFullList({
        expand: 'question',
        requestKey: null,
      });

      const wrongBook = wrongRecords
        .map(r => r.expand?.question?.code)
        .filter(Boolean);

      set({ answers, wrongBook, loaded: true });
    } catch (err) {
      console.error('Failed to load user data:', err.message);
      set({ loaded: true });
    }
  },

  // ─── Record an answer ────────────────────────────────────

  recordAnswer: async (questionCode, sessionCode, questionNumber, selectedLabel, isCorrect) => {
    // Optimistic update
    set(state => {
      const newAnswers = { ...state.answers };
      if (!newAnswers[sessionCode]) newAnswers[sessionCode] = {};
      newAnswers[sessionCode][questionNumber] = selectedLabel;

      const newWrongBook = [...state.wrongBook];
      if (!isCorrect && !newWrongBook.includes(questionCode)) {
        newWrongBook.push(questionCode);
      } else if (isCorrect && newWrongBook.includes(questionCode)) {
        const idx = newWrongBook.indexOf(questionCode);
        newWrongBook.splice(idx, 1);
      }

      return { answers: newAnswers, wrongBook: newWrongBook };
    });

    // Persist to PocketBase
    try {
      const questionPbId = await getQuestionPbId(questionCode);
      const sessionPbId = await getSessionPbId(sessionCode);

      if (!questionPbId || !sessionPbId) {
        console.error('Missing PB ID for', questionCode, sessionCode);
        return;
      }

      // Find existing record (use getList — getFirstListItem throws on 404!)
      const existingList = await pb.collection('answer_records').getList(1, 1, {
        filter: `question="${questionPbId}"`,
        requestKey: null,
      });

      if (existingList.items.length > 0) {
        await pb.collection('answer_records').update(existingList.items[0].id, {
          selected_label: selectedLabel,
          is_correct: isCorrect,
        });
      } else {
        await pb.collection('answer_records').create({
          user: pb.authStore.model.id,
          question: questionPbId,
          session: sessionPbId,
          selected_label: selectedLabel,
          is_correct: isCorrect,
        });
      }

      // Manage wrong book
      if (!isCorrect) {
        try {
          await pb.collection('wrong_book').create({
            user: pb.authStore.model.id,
            question: questionPbId,
          });
        } catch {
          // Already exists — ok
        }
      } else {
        const wbList = await pb.collection('wrong_book').getList(1, 1, {
          filter: `question="${questionPbId}"`,
          requestKey: null,
        });
        if (wbList.items.length > 0) {
          await pb.collection('wrong_book').delete(wbList.items[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to save answer:', err.message);
    }
  },

  // ─── Remove from wrong book ──────────────────────────────

  removeFromWrongBook: async (questionCode) => {
    set(state => ({
      wrongBook: state.wrongBook.filter(id => id !== questionCode),
    }));

    try {
      const questionPbId = await getQuestionPbId(questionCode);
      if (!questionPbId) return;
      const wbList = await pb.collection('wrong_book').getList(1, 1, {
        filter: `question="${questionPbId}"`,
        requestKey: null,
      });
      if (wbList.items.length > 0) {
        await pb.collection('wrong_book').delete(wbList.items[0].id);
      }
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
      const sessionPbId = await getSessionPbId(sessionCode);
      if (!sessionPbId) return;
      // Delete all answer records for this session
      const records = await pb.collection('answer_records').getFullList({
        filter: `session="${sessionPbId}"`,
        requestKey: null,
      });
      for (const r of records) {
        await pb.collection('answer_records').delete(r.id);
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
      // Delete wrong book
      const wbRecords = await pb.collection('wrong_book').getFullList({ requestKey: null });
      for (const r of wbRecords) await pb.collection('wrong_book').delete(r.id);

      // Delete answer records
      const ansRecords = await pb.collection('answer_records').getFullList({ requestKey: null });
      for (const r of ansRecords) await pb.collection('answer_records').delete(r.id);
    } catch (err) {
      console.error('Failed to reset:', err.message);
    }
  },

  // ─── Import / Export ─────────────────────────────────────

  exportData: () => {
    const state = get();
    return {
      answers: state.answers,
      wrongBook: state.wrongBook,
      exportedAt: new Date().toISOString(),
    };
  },

  importData: async (answers, wrongBook) => {
    set(state => ({
      answers: { ...state.answers, ...answers },
      wrongBook: [...new Set([...state.wrongBook, ...wrongBook])],
    }));

    // Best-effort import to PocketBase
    try {
      for (const [sessionCode, questions] of Object.entries(answers)) {
        for (const [qNum, label] of Object.entries(questions)) {
          const questionCode = `${sessionCode}-${qNum}`;
          const questionPbId = await getQuestionPbId(questionCode);
          const sessionPbId = await getSessionPbId(sessionCode);
          if (!questionPbId || !sessionPbId) continue;
          try {
            await pb.collection('answer_records').create({
              user: pb.authStore.model.id,
              question: questionPbId,
              session: sessionPbId,
              selected_label: String(label),
              is_correct: false, // unknown; will be updated on re-answer
            });
          } catch { /* skip duplicates */ }
        }
      }

      for (const code of wrongBook) {
        const questionPbId = await getQuestionPbId(code);
        if (!questionPbId) continue;
        try {
          await pb.collection('wrong_book').create({
            user: pb.authStore.model.id,
            question: questionPbId,
          });
        } catch { /* skip duplicates */ }
      }
    } catch (err) {
      console.error('Import error:', err.message);
    }
  },
}));

export default useStore;
