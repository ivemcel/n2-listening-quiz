import { pb } from './pocketbase';
import { useEffect, useState } from 'react';

/**
 * React hook: returns current PocketBase auth state.
 */
export function useAuth() {
  const [user, setUser] = useState(pb.authStore.model);
  const [loading, setLoading] = useState(!pb.authStore.isValid);

  useEffect(() => {
    // Initial check — refresh if token exists but stale
    if (pb.authStore.isValid) {
      setUser(pb.authStore.model);
      setLoading(false);
    } else {
      // Try to refresh
      pb.collection('users').authRefresh()
        .then(() => {
          setUser(pb.authStore.model);
        })
        .catch(() => {
          setUser(null);
        })
        .finally(() => setLoading(false));
    }

    // Listen for auth changes
    const unsubscribe = pb.authStore.onChange((token, model) => {
      setUser(model || null);
    });

    return () => unsubscribe();
  }, []);

  return { user, loading };
}

export async function signUp(email, password) {
  return pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
  });
}

export async function signIn(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

export function signOut() {
  pb.authStore.clear();
}
