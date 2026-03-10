import express from 'express';
import { pgPool } from '../app.js';
import { io } from '../app.js';

const router = express.Router();

// Получить все чаты пользователя
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const chats = await pgPool.query(
      `SELECT 
        c.*,
        (
          SELECT jsonb_build_object(
            'id', u.id,
            'first_name', u.first_name,
            'last_name', u.last_name,
            'avatar', u.avatar,
            'is_online', u.is_online,
            'last_seen', u.last_seen
          )
          FROM users u
          JOIN chat_participants cp2 ON cp2.user_id = u.id
          WHERE cp2.chat_id = c.id AND u.id != $1
        ) as other_user,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', u.id,
              'first_name', u.first_name,
              'last_name', u.last_name,
              'avatar', u.avatar
            )
          )
          FROM users u
          JOIN chat_participants cp2 ON cp2.user_id = u.id
          WHERE cp2.chat_id = c.id
        ) as participants,
        (
          SELECT m.* 
          FROM messages m 
          WHERE m.chat_id = c.id 
          ORDER BY m.created_at DESC 
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*) 
          FROM messages m
          LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = $1
          WHERE m.chat_id = c.id 
          AND m.sender_id != $1
          AND (ms.status IS NULL OR ms.status != 'read')
        ) as unread_count
      FROM chats c
      JOIN chat_participants cp ON cp.chat_id = c.id
      WHERE cp.user_id = $1
      ORDER BY (
        SELECT MAX(created_at) 
        FROM messages 
        WHERE chat_id = c.id
      ) DESC NULLS LAST`,
      [userId]
    );
    
    res.json(chats.rows);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать новый чат (личный или групповой)
router.post('/', async (req, res) => {
  const client = await pgPool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { type, participant_ids, title } = req.body;
    const userId = req.user.id;
    
    // Проверка на существующий личный чат
    if (type === 'private' && participant_ids.length === 1) {
      const existingChat = await client.query(
        `SELECT c.id 
         FROM chats c
         JOIN chat_participants cp1 ON cp1.chat_id = c.id
         JOIN chat_participants cp2 ON cp2.chat_id = c.id
         WHERE c.type = 'private' 
         AND cp1.user_id = $1 
         AND cp2.user_id = $2`,
        [userId, participant_ids[0]]
      );
      
      if (existingChat.rows.length > 0) {
        await client.query('COMMIT');
        return res.json({ id: existingChat.rows[0].id, exists: true });
      }
    }
    
    // Создание чата
    const newChat = await client.query(
      `INSERT INTO chats (type, title, created_by) 
       VALUES ($1, $2, $3) RETURNING *`,
      [type, title || null, userId]
    );
    
    const chatId = newChat.rows[0].id;
    
    // Добавление создателя
    await client.query(
      `INSERT INTO chat_participants (chat_id, user_id, role) 
       VALUES ($1, $2, $3)`,
      [chatId, userId, type === 'group' ? 'owner' : 'member']
    );
    
    // Добавление остальных участников
    for (const pid of participant_ids) {
      if (pid !== userId) {
        await client.query(
          `INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)`,
          [chatId, pid]
        );
      }
    }
    
    await client.query('COMMIT');
    
    // Получение полных данных чата для ответа
    const chatData = await client.query(
      `SELECT 
        c.*,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', u.id,
              'first_name', u.first_name,
              'last_name', u.last_name,
              'avatar', u.avatar
            )
          )
          FROM users u
          JOIN chat_participants cp2 ON cp2.user_id = u.id
          WHERE cp2.chat_id = c.id
        ) as participants
      FROM chats c
      WHERE c.id = $1`,
      [chatId]
    );
    
    // Уведомление участников через сокет
    for (const pid of participant_ids) {
      io.to(`user_${pid}`).emit('new_chat', chatData.rows[0]);
    }
    
    res.status(201).json(chatData.rows[0]);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// Получить информацию о чате
router.get('/:chatId', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    
    const chat = await pgPool.query(
      `SELECT 
        c.*,
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', u.id,
              'first_name', u.first_name,
              'last_name', u.last_name,
              'avatar', u.avatar,
              'role', cp.role,
              'joined_at', cp.joined_at
            )
          )
          FROM users u
          JOIN chat_participants cp ON cp.user_id = u.id
          WHERE cp.chat_id = c.id
        ) as participants
      FROM chats c
      WHERE c.id = $1`,
      [chatId]
    );
    
    if (chat.rows.length === 0) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    
    res.json(chat.rows[0]);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
