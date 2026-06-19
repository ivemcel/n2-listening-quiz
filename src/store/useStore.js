import { create } from 'zustand';
import { supabase } from '../lib/supabase';

const useStore = create((set, get) => ({
  // ─── Client-side state (fast, reactive) ──────────────────

  answers: {},       // { sessionId: { questionNumber: selectedLabel } }
  wrongBook: [],     // array of question IDs
  loaded: false,     // true after data fetched from Supabase

  // ─── Load user data from Supabase ────────────────────────

  loadUserData: async (userId) => {
    if (!userId) return;

    try {
      // Fetch answer records
      const { data: records, error: recErr } = await supabase
        .from('answer_records')
        .select('session_id, question_id, selected_label, is_correct');

      if (recErr) throw recErr;

      // Reconstruct answers object from records
      const answers = {};
      (records || []).forEach(r => {
        // Extract question number from "201607-1" format
        const parts = r.question_id.split('-');
        const questionNumber = parseInt(parts[parts.length - 1], 10);
        if (!answers[r.session_id]) answers[r.session_id] = {};
        answers[r.session_id][questionNumber] = r.selected_label;
      });

      // Fetch wrong book
      const { data: wrong, error: wErr } = await supabase
        .from('wrong_book')
        .select('question_id');

      if (wErr) throw wErr;

      const wrongBook = (wrong || []).map(w => w.question_id);

      set({ answers, wrongBook, loaded: true });
    } catch (err) {
      console.error('Failed to load user data:', err.message);
      set({ loaded: true }); // Still mark loaded so UI doesn't hang
    }
  },

  // ─── Record an answer ─────────────────────────────────────

  recordAnswer: async (questionId, sessionId, questionNumber, selectedLabel, isCorrect) => {
    // Optimistic update to client state
    set(state => {
      const newAnswers = { ...state.answers };
      if (!newAnswers[sessionId]) newAnswers[sessionId] = {};
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

    // Persist to Supabase
    try {
      // Upsert answer record
      const { error: ansErr } = await supabase
        .from('answer_records')
        .upsert({
          question_id: questionId,
          session_id: sessionId,
          selected_label: selectedLabel,
          is_correct: isCorrect,
        });

      if (ansErr) throw ansErr;

      // Manage wrong book
      if (!isCorrect) {
        await supabase
          .from('wrong_book')
          .upsert({ question_id: questionId });
      } else {
        await supabase
          .from('wrong_book')
          .delete()
          .eq('question_id', questionId);
      }
    } catch (err) {
      console.error('Failed to save answer:', err.message);
    }
  },

  // ─── Remove from wrong book ───────────────────────────────

  removeFromWrongBook: async (questionId) => {
    set(state => ({
      wrongBook: state.wrongBook.filter(id => id !== questionId),
    }));

    try {
      await supabase
        .from('wrong_book')
        .delete()
        .eq('question_id', questionId);
    } catch (err) {
      console.error('Failed to remove from wrong book:', err.message);
    }
  },

  // ─── Clear all answers for a session ──────────────────────

  clearSession: async (sessionId) => {
    set(state => {
      const newAnswers = { ...state.answers };
      if (newAnswers[sessionId]) {
        // Get all question IDs for this session to remove from wrong book
        const sessionQuestions = Object.keys(newAnswers[sessionId]);
        // We'll handle wrong book cleanup after state update
        delete newAnswers[sessionId];
        return { answers: newAnswers };
      }
      return state;
    });

    try {
      await supabase
        .from('answer_records')
        .delete()
        .eq('session_id', sessionId);
    } catch (err) {
      console.error('Failed to clear session:', err.message);
    }
  },

  // ─── Get answer for a specific question ───────────────────

  getAnswer: (sessionId, questionNumber) => {
    const state = get();
    return state.answers[sessionId]?.[questionNumber] ?? null;
  },

  // ─── Get session stats ────────────────────────────────────

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

  // ─── Reset all user data ──────────────────────────────────

  resetAll: async () => {
    set({ answers: {}, wrongBook: [] });

    try {
      await supabase.from('wrong_book').delete().neq('id', 0);
      await supabase.from('answer_records').delete().neq('id', 0);
    } catch (err) {
      console.error('Failed to reset all data:', err.message);
    }
  },

  // ─── Export data for backup ───────────────────────────────

  exportData: () => {
    const state = get();
    return {
      answers: state.answers,
      wrongBook: state.wrongBook,
      exportedAt: new Date().toISOString(),
    };
  },

  // ─── Import data from backup (merges with existing) ───────

  importData: async (answers, wrongBook) => {
    // Merge into client state
    set(state => ({
      answers: { ...state.answers, ...answers },
      wrongBook: [...new Set([...state.wrongBook, ...wrongBook])],
    }));

    // Bulk upsert to Supabase (best-effort per record)
    try {
      // Import answers
      for (const [sessionId, questions] of Object.entries(answers)) {
        for (const [qn, label] of Object.entries(questions)) {
          const questionId = `${sessionId}-${qn}`;
          const { error: ansErr } = await supabase
            .from('answer_records')
            .upsert({
              question_id: questionId,
              session_id: sessionId,
              selected_label: String(label),
              is_correct: null, // We don't know correctness from export
            });
          if (ansErr) console.error('Import answer error:', ansErr.message);
        }
      }

      // Import wrong book
      for (const qid of wrongBook) {
        const { error: wbErr } = await supabase
          .from('wrong_book')
          .upsert({ question_id: qid });
        if (wbErr) console.error('Import wrong book error:', wbErr.message);
      }
    } catch (err) {
      console.error('Failed to import data:', err.message);
    }
  },
}));

export default useStore;
