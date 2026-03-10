import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pgPool } from '../app.js';

const router = express.Router();

// Регистрация по номеру телефона
router.post('/register', async (req, res) => {
  try {
    const { phone, first_name, last_name, password } = req.body;
    
    // Проверка существования
    const existingUser = await pgPool.query(
      'SELECT id FROM users WHERE phone = $1',
      [phone]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Номер уже зарегистрирован' });
    }
    
    // Хеширование пароля
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    
    // Создание пользователя
    const newUser = await pgPool.query(
      `INSERT INTO users (phone, first_name, last_name, password_hash, last_seen) 
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id, phone, first_name, last_name`,
      [phone, first_name, last_name, password_hash]
    );
    
    const user = newUser.rows[0];
    
    // Создание токена
    const token = jwt.sign(
      { id: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вход по номеру телефона
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    
    // Поиск пользователя
    const userResult = await pgPool.query(
      'SELECT * FROM users WHERE phone = $1',
      [phone]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный номер или пароль' });
    }
    
    const user = userResult.rows[0];
    
    // Проверка пароля
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Неверный номер или пароль' });
    }
    
    // Обновление last_seen
    await pgPool.query(
      'UPDATE users SET last_seen = NOW() WHERE id = $1',
      [user.id]
    );
    
    // Создание токена
    const token = jwt.sign(
      { id: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio
      }
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка токена
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Нет токена' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userResult = await pgPool.query(
      'SELECT id, phone, first_name, last_name, username, avatar, bio, last_seen, is_online FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json(userResult.rows[0]);
    
  } catch (error) {
    res.status(401).json({ error: 'Недействительный токен' });
  }
});

export default router;
