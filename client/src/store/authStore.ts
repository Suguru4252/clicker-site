import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface User {
  id: number;
  phone: string;
  first_name: string;
  last_name: string;
  username?: string;
  avatar?: string;
  bio?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (phone: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await axios.post(`${API_URL}/auth/login`, {
            phone,
            password
          });
          
          const { token, user } = response.data;
          
          // Сохраняем токен для axios
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          set({ token, user, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          const response = await axios.post(`${API_URL}/auth/register`, data);
          
          const { token, user } = response.data;
          
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          set({ token, user, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        delete axios.defaults.headers.common['Authorization'];
        set({ user: null, token: null });
      },

      checkAuth: async () => {
        const { token } = get();
        if (!token) return;
        
        try {
          const response = await axios.get(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          set({ user: response.data });
        } catch (error) {
          set({ user: null, token: null });
        }
      }
    }),
    {
      name: 'auth-storage'
    }
  )
);
