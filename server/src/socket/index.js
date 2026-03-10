import jwt from 'jsonwebtoken';
import { pgPool, redisClient } from '../app.js';

export function setupSocketHandlers(io) {
  // Мидлвар для аутентификации
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      
      // Сохраняем в Redis онлайн статус
      await redisClient.set(`online:${decoded.id}`, 'true', {
        EX: 300 // 5 минут
      });
      
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Пользователь ${socket.userId} подключился`);
    
    // Подписка на комнаты пользователя (его личные уведомления)
    socket.join(`user_${socket.userId}`);
    
    // Обновление статуса онлайн
    (async () => {
      await pgPool.query(
        'UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1',
        [socket.userId]
      );
      
      // Уведомление контактам
      socket.broadcast.emit('user_online', { user_id: socket.userId });
    })();
    
    // Подписка на комнаты чатов пользователя
    (async () => {
      const chats = await pgPool.query(
        'SELECT chat_id FROM chat_participants WHERE user_id = $1',
        [socket.userId]
      );
      
      chats.rows.forEach(chat => {
        socket.join(`chat_${chat.chat_id}`);
      });
    })();
    
    // Отправка сообщения (уже обрабатывается в routes, но можно и через сокет)
    socket.on('send_message', async (data) => {
      try {
        const { chat_id, text } = data;
        
        // Здесь можно реализовать отправку через сокет
        // Но мы уже сделали через HTTP POST /api/messages
        
        socket.to(`chat_${chat_id}`).emit('typing', {
          user_id: socket.userId,
          chat_id,
          typing: false
        });
        
      } catch (error) {
        console.error(error);
      }
    });
    
    // Печатает...
    socket.on('typing', (data) => {
      const { chat_id, typing } = data;
      socket.to(`chat_${chat_id}`).emit('typing', {
        user_id: socket.userId,
        chat_id,
        typing
      });
    });
    
    // Прочитано сообщение
    socket.on('mark_read', async (data) => {
      const { chat_id, message_id } = data;
      
      try {
        await pgPool.query(
          `UPDATE message_status 
           SET status = 'read', updated_at = NOW() 
           WHERE message_id = $1 AND user_id = $2`,
          [message_id, socket.userId]
        );
        
        // Уведомление отправителя
        const messageInfo = await pgPool.query(
          'SELECT sender_id FROM messages WHERE id = $1',
          [message_id]
        );
        
        if (messageInfo.rows.length > 0) {
          io.to(`user_${messageInfo.rows[0].sender_id}`).emit('message_read', {
            message_id,
            user_id: socket.userId,
            chat_id
          });
        }
        
      } catch (error) {
        console.error(error);
      }
    });
    
    // Отключение
    socket.on('disconnect', async () => {
      console.log(`🔌 Пользователь ${socket.userId} отключился`);
      
      // Проверяем, есть ли у пользователя другие активные соединения
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => s.userId === socket.userId);
      
      if (userSockets.length === 0) {
        // Нет активных соединений - пользователь офлайн
        await pgPool.query(
          'UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1',
          [socket.userId]
        );
        
        await redisClient.del(`online:${socket.userId}`);
        
        // Уведомление контактам
        socket.broadcast.emit('user_offline', { 
          user_id: socket.userId,
          last_seen: new Date()
        });
      }
    });
  });
          }
