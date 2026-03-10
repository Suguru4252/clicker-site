import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';

// Импорты маршрутов
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chats.js';
import messageRoutes from './routes/messages.js';
import userRoutes from './routes/users.js';

// Импорты сокетов
import { setupSocketHandlers } from './socket/index.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? 'https://chugur.vercel.app' 
      : 'http://localhost:5173',
    credentials: true
  }
});

// ===== БАЗА ДАННЫХ =====
export const pgPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// ===== REDIS (КЕШ) =====
export const redisClient = createClient({
  url: process.env.REDIS_URL
});

await redisClient.connect();

// ===== MIDDLEWARE =====
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://chugur.vercel.app' 
    : 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Статика для файлов
app.use('/uploads', express.static('uploads'));

// ===== АУТЕНТИФИКАЦИЯ ЧЕРЕЗ JWT =====
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ===== РОУТЫ =====
app.use('/api/auth', authRoutes);
app.use('/api/chats', authenticateToken, chatRoutes);
app.use('/api/messages', authenticateToken, messageRoutes);
app.use('/api/users', authenticateToken, userRoutes);

// ===== СОЗДАНИЕ ТАБЛИЦ В БД =====
async function initializeDatabase() {
  try {
    // Таблица пользователей
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        bio TEXT,
        avatar TEXT,
        last_seen TIMESTAMP DEFAULT NOW(),
        is_online BOOLEAN DEFAULT false,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Таблица чатов
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        type VARCHAR(20) DEFAULT 'private', -- private, group, channel
        title VARCHAR(255),
        avatar TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Участники чатов
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'member', -- owner, admin, member
        joined_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (chat_id, user_id)
      )
    `);
    
    // Сообщения
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id),
        text TEXT,
        file_url TEXT,
        file_type VARCHAR(50),
        reply_to INTEGER REFERENCES messages(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Статусы сообщений (прочитано/доставлено)
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS message_status (
        message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'sent', -- sent, delivered, read
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id)
      )
    `);
    
    console.log('✅ База данных инициализирована');
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
  }
}

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 5000;

initializeDatabase().then(() => {
  // Настройка WebSocket
  setupSocketHandlers(io);
  
  httpServer.listen(PORT, () => {
    console.log(`🚀 Chugur сервер запущен на порту ${PORT}`);
    console.log(`📡 WebSocket готов к подключениям`);
  });
});

export { io };
