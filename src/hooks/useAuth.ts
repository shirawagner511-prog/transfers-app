import { useEffect, useState } from 'react';
import { type User, type Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserProfile, UserRole } from '@/types/database.types';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null }));
      if (session?.user) loadProfile(session.user.id);
      else setState(prev => ({ ...prev, loading: false }));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(prev => ({ ...prev, session, user: session?.user ?? null }));
      if (session?.user) loadProfile(session.user.id);
      else setState(prev => ({ ...prev, profile: null, loading: false }));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    setState(prev => ({ ...prev, profile: data ?? null, loading: false }));
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function hasRole(...roles: UserRole[]): boolean {
    if (!state.profile) return false;
    return roles.includes(state.profile.role);
  }

  function canEdit(): boolean {
    return hasRole('admin', 'manager', 'editor');
  }

  function canApprove(): boolean {
    return hasRole('admin', 'manager');
  }

  function canManageUsers(): boolean {
    return hasRole('admin');
  }

  return { ...state, signIn, signOut, hasRole, canEdit, canApprove, canManageUsers };
}
