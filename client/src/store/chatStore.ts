import { create } from 'zustand';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface Message {
  id: number;
  chat_id: number;
  sender_id: number;
  text: string;
  file_url?: string;
  file_type?: string;
  created_at: string;
  sender: {
    id: number;
    first_name: string;
    last_name: string;
    avatar?: string;
  };
  statuses?: Array<{
    user_id: number;
    status: string;
  }>;
}

interface Chat {
  id: number;
  type: 'private' | 'group';
  title?: string;
  avatar?: string;
  participants: Array<{
    id: number;
    first_name: string;
    last_name: string;
    avatar?: string;
    role?: string;
  }>;
  last_message?: Message;
  unread_count: number;
}

interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Record<number, Message[]>;
  isLoading: boolean;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: number) => Promise<void>;
  sendMessage: (chatId: number, text: string) => Promise<void>;
  setActiveChat: (chat: Chat | null) => void;
  addMessage: (message: Message) => void;
  updateMessageStatus: (messageId: number, userId: number, status: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  messages: {},
  isLoading: false,

  loadChats: async () => {
    set({ isLoading: true });
    try {
      const response = await axios.get(`${API_URL}/chats`);
      set({ chats: response.data, isLoading: false });
    } catch (error) {
      console.error(error);
      set({ isLoading: false });
    }
  },

  loadMessages: async (chatId: number) => {
    try {
      const response = await axios.get(`${API_URL}/messages/${chatId}`);
      set(state => ({
        messages: {
          ...state.messages,
          [chatId]: response.data
        }
      }));
    } catch (error) {
      console.error(error);
    }
  },

  sendMessage: async (chatId: number, text: string) => {
    try {
      await axios.post(`${API_URL}/messages`, {
        chat_id: chatId,
        text
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  setActiveChat: (chat) => {
    set({ activeChat: chat });
  },

  addMessage: (message) => {
    set(state => {
      const chatMessages = state.messages[message.chat_id] || [];
      
      // Проверка на дубликат
      if (chatMessages.some(m => m.id === message.id)) {
        return state;
      }
      
      return {
        messages: {
          ...state.messages,
          [message.chat_id]: [...chatMessages, message]
        },
        chats: state.chats.map(chat => 
          chat.id === message.chat_id 
            ? { ...chat, last_message: message }
            : chat
        )
      };
    });
  },

  updateMessageStatus: (messageId, userId, status) => {
    set(state => {
      const newMessages = { ...state.messages };
      
      Object.keys(newMessages).forEach(chatId => {
        newMessages[Number(chatId)] = newMessages[Number(chatId)].map(msg => {
          if (msg.id === messageId && msg.statuses) {
            return {
              ...msg,
              statuses: msg.statuses.map(s => 
                s.user_id === userId ? { ...s, status } : s
              )
            };
          }
          return msg;
        });
      });
      
      return { messages: newMessages };
    });
  }
}));
