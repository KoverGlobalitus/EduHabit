require('dotenv').config();

const express      = require('express');
const cookieParser = require('cookie-parser');
const path         = require('path');

const authRoutes  = require('./routes/auth');
const goalsRoutes = require('./routes/goals');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Статические файлы (CSS, JS, изображения) ────────────────────────────────
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// ── API роуты ────────────────────────────────────────────────────────────────
app.use('/api/auth',  authRoutes);
app.use('/api/goals', goalsRoutes);

// ── HTML страницы ────────────────────────────────────────────────────────────
const pagesDir = path.join(__dirname, '..', 'pages');

// Корень → страница входа
app.get('/', (req, res) => {
  res.sendFile(path.join(pagesDir, 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(pagesDir, 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(pagesDir, 'dashboard.html'));
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// ── Запуск ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 EduHabit запущен на http://localhost:${PORT}`);
});
