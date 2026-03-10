import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useChatStore } from './chatStore';
import toast from 'react-hot-toast';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connectSocket: (token: string) => void;
  disconnectSocket: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connectSocket: (token: string) => {
    if (get().socket?.connected) return;
    
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket']
    });
    
    socket.on('connect', () => {
      console.log('Socket connected');
      set({ isConnected: true });
    });
    
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      set({ isConnected: false });
    });
    
    // Новое сообщение
    socket.on('new_message', (message) => {
      useChatStore.getState().addMessage(message);
      
      // Если это не текущий чат, показываем уведомление
      const activeChat = useChatStore.getState().activeChat;
      if (activeChat?.id !== message.chat_id) {
        toast.custom((t) => (
          <div className="bg-telegram-blue text-white p-3 rounded-lg shadow-lg">
            <b>{message.sender.first_name}:</b> {message.text}
          </div>
        ));
      }
    });
    
    // Обновление статуса сообщения
    socket.on('message_status_update', (data) => {
      useChatStore.getState().updateMessageStatus(
        data.message_id,
        data.user_id,
        data.status
      );
    });
    
    // Пользователь печатает
    socket.on('typing', (data) => {
      // Можно реализовать индикатор печатания
    });
    
    socket.on('user_online', (data) => {
      // Обновление статуса онлайн
    });
    
    socket.on('user_offline', (data) => {
      // Обновление статуса офлайн
    });
    
    socket.on('new_chat', (chat) => {
      useChatStore.getState().loadChats();
    });
    
    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  }
}));
