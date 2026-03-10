import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ChatListProps {
  chats: any[];
  activeChat: any;
  onSelectChat: (chat: any) => void;
  currentUser: any;
}

export default function ChatList({ chats, activeChat, onSelectChat, currentUser }: ChatListProps) {
  const getChatName = (chat: any) => {
    if (chat.type === 'private') {
      const otherUser = chat.participants.find((p: any) => p.id !== currentUser?.id);
      return otherUser ? `${otherUser.first_name} ${otherUser.last_name}` : 'Unknown';
    }
    return chat.title || 'Group';
  };

  const getChatAvatar = (chat: any) => {
    if (chat.type === 'private') {
      const otherUser = chat.participants.find((p: any) => p.id !== currentUser?.id);
      return otherUser?.avatar;
    }
    return chat.avatar;
  };

  const getLastMessageTime = (chat: any) => {
    if (!chat.last_message) return '';
    
    try {
      return formatDistanceToNow(new Date(chat.last_message.created_at), {
        addSuffix: true,
        locale: ru
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {chats.map(chat => (
        <div
          key={chat.id}
          onClick={() => onSelectChat(chat)}
          className={`flex items-center p-4 cursor-pointer hover:bg-gray-100 transition ${
            activeChat?.id === chat.id ? 'bg-telegram-light' : ''
          }`}
        >
          {/* Аватар */}
          <div className="relative">
            {getChatAvatar(chat) ? (
              <img 
                src={getChatAvatar(chat)} 
                alt="avatar"
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-telegram-blue text-white flex items-center justify-center text-lg">
                {getChatName(chat)[0]}
              </div>
            )}
            
            {/* Онлайн статус (для личных чатов) */}
            {chat.type === 'private' && (
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                chat.participants.find((p: any) => p.id !== currentUser?.id)?.is_online
                  ? 'bg-green-500'
                  : 'bg-gray-400'
              }`} />
            )}
          </div>

          {/* Информация */}
          <div className="flex-1 ml-4 min-w-0">
            <div className="flex justify-between items-baseline">
              <h3 className="font-semibold truncate">{getChatName(chat)}</h3>
              <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                {getLastMessageTime(chat)}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600 truncate">
                {chat.last_message?.text || 'Нет сообщений'}
              </p>
              
              {chat.unread_count > 0 && (
                <span className="ml-2 bg-telegram-blue text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                  {chat.unread_count}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      {chats.length === 0 && (
        <div className="text-center text-gray-500 mt-8">
          Нет чатов
        </div>
      )}
    </div>
  );
            }
