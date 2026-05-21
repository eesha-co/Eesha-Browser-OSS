import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getMe, logout as apiLogout } from '../services/authService';

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  // Subscription state — populated by deployments that wire an external
  // billing system (e.g. learn.eesha.onrender.com). Self-hosted OSS images leave these
  // at the safe defaults (no paid features unlock).
  is_paid_subscriber?: boolean;
  subscription_status?: string | null;
  subscription_period_end?: string | null;
}

interface AuthState {
  user: UserResponse | null;
  isLoading: boolean;
  checkSession: () => Promise<void>;
  setUser: (user: UserResponse | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,

      checkSession: async () => {
        set({ isLoading: true });
        try {
          const user = await getMe();
          set({ user, isLoading: false });
        } catch {
          set({ user: null, isLoading: false });
        }
      },

      setUser: (user) => set({ user }),

      logout: async () => {
        try {
          await apiLogout();
        } catch {
          // ignore
        }
        set({ user: null });
      },
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
