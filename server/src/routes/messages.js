import express from 'express';
import { pgPool } from '../app.js';
import { io } from '../app.js';

const router = express.Router();

// Получить сообщения чата
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { offset = 0, limit = 50 } = req.query;
    const userId = req.user.id;
    
    const messages = await pgPool.query(
      `SELECT 
        m.*,
        jsonb_build_object(
          'id', u.id,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'avatar', u.avatar
        ) as sender,
        (
          SELECT jsonb_build_object(
            'status', ms.status,
            'updated_at', ms.updated_at
          )
          FROM message_status ms
          WHERE ms.message_id = m.id AND ms.user_id = $1
        ) as my_status,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'user_id', ms.user_id,
              'status', ms.status,
              'updated_at', ms.updated_at
            )
          )
          FROM message_status ms
          WHERE ms.message_id = m.id
        ) as all_statuses
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $2
      ORDER BY m.created_at DESC
      LIMIT $3 OFFSET $4`,
      [userId, chatId, limit, offset]
    );
    
    res.json(messages.rows.reverse());
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отправить сообщение
router.post('/', async (req, res) => {
  const client = await pgPool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { chat_id, text, reply_to, file_url, file_type } = req.body;
    const sender_id = req.user.id;
    
    // Создание сообщения
    const newMessage = await client.query(
      `INSERT INTO messages (chat_id, sender_id, text, reply_to, file_url, file_type) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [chat_id, sender_id, text, reply_to || null, file_url || null, file_type || null]
    );
    
    const messageId = newMessage.rows[0].id;
    
    // Получаем всех участников чата для статусов
    const participants = await client.query(
      'SELECT user_id FROM chat_participants WHERE chat_id = $1',
      [chat_id]
    );
    
    // Создаем записи статусов для всех участников
    for (const p of participants.rows) {
      await client.query(
        `INSERT INTO message_status (message_id, user_id, status) 
         VALUES ($1, $2, $3)`,
        [messageId, p.user_id, p.user_id === sender_id ? 'sent' : 'delivered']
      );
    }
    
    await client.query('COMMIT');
    
    // Получаем полные данные сообщения для отправки
    const fullMessage = await client.query(
      `SELECT 
        m.*,
        jsonb_build_object(
          'id', u.id,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'avatar', u.avatar
        ) as sender,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'user_id', ms.user_id,
              'status', ms.status,
              'updated_at', ms.updated_at
            )
          )
          FROM message_status ms
          WHERE ms.message_id = m.id
        ) as statuses
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = $1`,
      [messageId]
    );
    
    // Отправка через WebSocket всем в чате
    io.to(`chat_${chat_id}`).emit('new_message', fullMessage.rows[0]);
    
    res.status(201).json(fullMessage.rows[0]);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// Обновить статус сообщения (прочитано)
router.put('/status/:messageId', async (req, res) => {
  const client = await pgPool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { messageId } = req.params;
    const { status } = req.body; // 'read', 'delivered'
    const userId = req.user.id;
    
    await client.query(
      `UPDATE message_status 
       SET status = $1, updated_at = NOW() 
       WHERE message_id = $2 AND user_id = $3`,
      [status, messageId, userId]
    );
    
    await client.query('COMMIT');
    
    // Уведомление отправителя
    const messageInfo = await client.query(
      'SELECT sender_id, chat_id FROM messages WHERE id = $1',
      [messageId]
    );
    
    if (messageInfo.rows.length > 0) {
      io.to(`user_${messageInfo.rows[0].sender_id}`).emit('message_status_update', {
        message_id: parseInt(messageId),
        user_id: userId,
        status,
        chat_id: messageInfo.rows[0].chat_id
      });
    }
    
    res.json({ success: true });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

export default router;
