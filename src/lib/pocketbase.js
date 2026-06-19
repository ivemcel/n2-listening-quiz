import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090';

export const pb = new PocketBase(PB_URL);

// Auto-refresh auth token
pb.authStore.onChange(() => {
  // Token is automatically persisted in localStorage by PB SDK
});

// ─── Question ID mapping (code → PB record ID) ────────────

let codeToIdMap = null;

/** Fetch question code→id mapping from PocketBase. Cached after first call. */
export async function getQuestionIdMap() {
  if (codeToIdMap) return codeToIdMap;

  const records = await pb.collection('questions').getFullList({
    fields: 'id,code',
    requestKey: null, // bypass auto-cancel
  });

  codeToIdMap = new Map();
  for (const r of records) {
    codeToIdMap.set(r.code, r.id);
  }
  return codeToIdMap;
}

/** Get PB record ID from question code (e.g., "201607-1" → "abc123...") */
export async function getQuestionPbId(code) {
  const map = await getQuestionIdMap();
  return map.get(code) || null;
}

/** Get question code from PB record ID (reverse lookup) */
export async function getQuestionCode(pbId) {
  const map = await getQuestionIdMap();
  for (const [code, id] of map.entries()) {
    if (id === pbId) return code;
  }
  return null;
}

// ─── Session ID mapping ───────────────────────────────────

let codeToSessionIdMap = null;

export async function getSessionIdMap() {
  if (codeToSessionIdMap) return codeToSessionIdMap;

  const records = await pb.collection('sessions').getFullList({
    fields: 'id,code',
    requestKey: null,
  });

  codeToSessionIdMap = new Map();
  for (const r of records) {
    codeToSessionIdMap.set(r.code, r.id);
  }
  return codeToSessionIdMap;
}

export async function getSessionPbId(code) {
  const map = await getSessionIdMap();
  return map.get(code) || null;
}
