import React, { useEffect, useState, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import toast from 'react-hot-toast';
import axios from 'axios';

// Компоненты
import ChatList from '../components/ChatList';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import ChatHeader from '../components/ChatHeader';
import Sidebar from '../components/Sidebar';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function ChatPage() {
  const { user, logout } = useAuthStore();
  const { 
    chats, 
    activeChat, 
    loadChats, 
    setActiveChat, 
    sendMessage,
    loadMessages,
    messages
  } = useChatStore();
  const { socket, isConnected } = useSocketStore();
  
  const [showSidebar, setShowSidebar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat.id);
    }
  }, [activeChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeChat]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (text: string) => {
    if (!activeChat) return;
    
    try {
      await sendMessage(activeChat.id, text);
    } catch (error) {
      toast.error('Ошибка при отправке');
    }
  };

  const handleTyping = (typing: boolean) => {
    if (!activeChat || !socket) return;
    socket.emit('typing', {
      chat_id: activeChat.id,
      typing
    });
  };

  const handleCreateChat = async (userId: number) => {
    try {
      await axios.post(`${API_URL}/chats`, {
        type: 'private',
        participant_ids: [userId]
      });
      loadChats();
    } catch (error) {
      toast.error('Ошибка при создании чата');
    }
  };

  const filteredChats = chats.filter(chat => {
    if (chat.type === 'private') {
      const otherUser = chat.participants.find(p => p.id !== user?.id);
      if (!otherUser) return false;
      return `${otherUser.first_name} ${otherUser.last_name}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    }
    return chat.title?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex h-screen bg-white">
      {/* Левая панель */}
      <div className={`${showSidebar ? 'w-80' : 'w-96'} flex flex-col border-r`}>
        {/* Верхняя панель */}
        <div className="p-4 bg-telegram-light flex items-center justify-between">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 hover:bg-gray-200 rounded-full"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold">Chugur</h1>
          <div className="w-10 h-10 rounded-full bg-telegram-blue text-white flex items-center justify-center">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
        </div>

        {/* Поиск */}
        <div className="p-4">
          <input
            type="text"
            placeholder="Поиск"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue"
          />
        </div>

        {/* Список чатов */}
        <ChatList 
          chats={filteredChats}
          activeChat={activeChat}
          onSelectChat={setActiveChat}
          currentUser={user}
        />
      </div>

      {/* Правая панель (чат) */}
      {activeChat ? (
        <div className="flex-1 flex flex-col">
          <ChatHeader 
            chat={activeChat} 
            currentUser={user}
            isOnline={isConnected}
          />
          <MessageList 
            messages={messages[activeChat.id] || []}
            currentUser={user}
            chat={activeChat}
          />
          <MessageInput 
            onSendMessage={handleSendMessage}
            onTyping={handleTyping}
          />
          <div ref={messagesEndRef} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-gray-400 mb-2">
              Добро пожаловать в Chugur
            </h2>
            <p className="text-gray-500">
              Выберите чат для начала общения
            </p>
          </div>
        </div>
      )}

      {/* Боковая панель */}
      {showSidebar && (
        <Sidebar 
          onClose={() => setShowSidebar(false)}
          onCreateChat={handleCreateChat}
          onLogout={logout}
          currentUser={user}
        />
      )}
    </div>
  );
    }
