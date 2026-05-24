import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@bgf/shared-types';
import { api } from '../lib/api.js';

interface AuthState {
  userId: string | null;
  username: string | null;
  token: string | null;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      username: null,
      token: null,
      async login(req) {
        const res = await api<AuthResponse>('POST', '/api/auth/login', { body: req });
        set({ userId: res.userId, username: res.username, token: res.accessToken });
      },
      async register(req) {
        const res = await api<AuthResponse>('POST', '/api/auth/register', { body: req });
        set({ userId: res.userId, username: res.username, token: res.accessToken });
      },
      logout() {
        set({ userId: null, username: null, token: null });
      },
    }),
    { name: 'bgf-auth' },
  ),
);
