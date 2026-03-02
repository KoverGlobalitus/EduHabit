const express = require('express');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

const router = express.Router();

// Все маршруты защищены — нужен валидный JWT
router.use(auth);

// ── GET /api/goals — список целей текущего пользователя ─────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    return res.json({ goals: result.rows });
  } catch (err) {
    console.error('get goals error:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── POST /api/goals — создать цель ──────────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, description, frequency } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Название обязательно' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO goals (user_id, title, description, frequency)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, title.trim(), description?.trim() || null, frequency || 'Ежедневно']
    );
    return res.status(201).json({ goal: result.rows[0] });
  } catch (err) {
    console.error('create goal error:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── PATCH /api/goals/:id — обновить цель (название, описание, отметить) ──────
router.patch('/:id', async (req, res) => {
  const { title, description, frequency, completed, streak } = req.body;
  const goalId = parseInt(req.params.id, 10);

  try {
    // Убеждаемся, что цель принадлежит этому пользователю
    const check = await pool.query(
      'SELECT id FROM goals WHERE id = $1 AND user_id = $2',
      [goalId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }

    const result = await pool.query(
      `UPDATE goals
       SET title       = COALESCE($1, title),
           description = COALESCE($2, description),
           frequency   = COALESCE($3, frequency),
           completed   = COALESCE($4, completed),
           streak      = COALESCE($5, streak)
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [title?.trim() || null, description?.trim() || null, frequency || null,
       completed ?? null, streak ?? null, goalId, req.user.id]
    );
    return res.json({ goal: result.rows[0] });
  } catch (err) {
    console.error('update goal error:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── DELETE /api/goals/:id — удалить цель ────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const goalId = parseInt(req.params.id, 10);

  try {
    const result = await pool.query(
      'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id',
      [goalId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Цель не найдена' });
    }
    return res.json({ ok: true, deleted: goalId });
  } catch (err) {
    console.error('delete goal error:', err);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
