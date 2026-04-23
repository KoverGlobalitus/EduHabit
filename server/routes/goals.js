const express = require('express');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { resetExpiredGoals, markGoalCompleted, getCompletions } = require('../db/streaks');

const router = express.Router();
router.use(auth);

/* ── GET /api/goals ─────────────────────────────────────────
   Возвращает цели + историю выполнений за 21 день (для мини-календаря)
───────────────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    await resetExpiredGoals(req.user.id);

    const { rows: goals } = await pool.query(
      'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );

    // Подгружаем историю выполнений для всех целей (21 день)
    const goalIds    = goals.map(g => g.id);
    const compMap    = await getCompletions(goalIds, 21);

    const result = goals.map(g => ({ ...g, completions: compMap[g.id] || [] }));
    return res.json({ goals: result });
  } catch (err) {
    console.error('get goals:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ── POST /api/goals ────────────────────────────────────────── */
router.post('/', async (req, res) => {
  const { title, description, frequency } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'Название обязательно' });

  const validFreq = ['Ежедневно', 'По будням', 'Еженедельно'];
  const freq = validFreq.includes(frequency) ? frequency : 'Ежедневно';

  try {
    const { rows } = await pool.query(
      `INSERT INTO goals (user_id, title, description, frequency)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, title.trim(), description?.trim() || null, freq]
    );
    return res.status(201).json({ goal: { ...rows[0], completions: [] } });
  } catch (err) {
    console.error('create goal:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ── PATCH /api/goals/:id/toggle ────────────────────────────── */
router.patch('/:id/toggle', async (req, res) => {
  const goalId = parseInt(req.params.id, 10);
  if (isNaN(goalId)) return res.status(400).json({ error: 'Некорректный ID' });

  try {
    const goal = await markGoalCompleted(goalId, req.user.id);
    if (!goal) return res.status(404).json({ error: 'Цель не найдена' });
    return res.json({ goal });
  } catch (err) {
    console.error('toggle goal:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ── PATCH /api/goals/:id (редактирование) ──────────────────── */
router.patch('/:id', async (req, res) => {
  const goalId = parseInt(req.params.id, 10);
  if (isNaN(goalId)) return res.status(400).json({ error: 'Некорректный ID' });

  const { title, description, frequency } = req.body;
  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: 'Название не может быть пустым' });
  }

  try {
    const check = await pool.query(
      'SELECT id FROM goals WHERE id = $1 AND user_id = $2',
      [goalId, req.user.id]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Цель не найдена' });

    const { rows } = await pool.query(
      `UPDATE goals
       SET title       = COALESCE($1, title),
           description = COALESCE($2, description),
           frequency   = COALESCE($3, frequency),
           updated_at  = NOW()
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [title?.trim() || null, description?.trim() ?? null, frequency || null, goalId, req.user.id]
    );
    return res.json({ goal: rows[0] });
  } catch (err) {
    console.error('update goal:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ── DELETE /api/goals/:id ──────────────────────────────────── */
router.delete('/:id', async (req, res) => {
  const goalId = parseInt(req.params.id, 10);
  if (isNaN(goalId)) return res.status(400).json({ error: 'Некорректный ID' });

  try {
    const { rows } = await pool.query(
      'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id',
      [goalId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Цель не найдена или уже удалена' });
    return res.json({ ok: true, deleted: goalId });
  } catch (err) {
    console.error('delete goal:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ── GET /api/goals/leaderboard ─────────────────────────────
   Топ пользователей по максимальному стрику среди всех целей.
   Публичный рейтинг: возвращает имя + лучший стрик.
───────────────────────────────────────────────────────────── */
router.get('/leaderboard', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.name,
        MAX(g.streak)        AS best_streak,
        COUNT(g.id)          AS goals_count,
        SUM(g.streak)        AS total_streak
      FROM users u
      JOIN goals g ON g.user_id = u.id
      GROUP BY u.id, u.name
      HAVING MAX(g.streak) > 0
      ORDER BY best_streak DESC, total_streak DESC
      LIMIT 20
    `);

    /* Пометить текущего пользователя */
    const myId = req.user.id;
    const data = rows.map((r, i) => ({
      rank:        i + 1,
      id:          r.id,
      name:        r.name,
      best_streak: parseInt(r.best_streak, 10),
      goals_count: parseInt(r.goals_count, 10),
      is_me:       r.id === myId,
    }));

    return res.json({ leaderboard: data });
  } catch (err) {
    console.error('leaderboard:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
