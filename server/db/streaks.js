const pool = require('./pool');

/**
 * Вся логика стриков живёт здесь.
 *
 * Правила:
 *  - Если last_completed_at = сегодня       → цель уже отмечена, не трогаем
 *  - Если last_completed_at = вчера         → цель не выполнена сегодня, сбрасываем completed → false
 *                                             streak остаётся (пользователь ещё может успеть сегодня)
 *  - Если last_completed_at < вчера (или NULL) → цель пропущена, сбрасываем completed → false
 *                                               и streak → 0
 */
async function resetExpiredGoals(userId) {
  // today и yesterday в UTC (Render работает в UTC)
  const now       = new Date();
  const todayUTC  = toDateString(now);
  const yesterdayUTC = toDateString(new Date(now.getTime() - 86400000));

  // Сбросить completed у всех целей где выполнение было НЕ сегодня
  await pool.query(`
    UPDATE goals
    SET completed = FALSE
    WHERE user_id = $1
      AND completed = TRUE
      AND (last_completed_at IS NULL OR last_completed_at < $2)
  `, [userId, todayUTC]);

  // Обнулить streak у целей где пропущен вчерашний день
  // (last_completed_at не сегодня и не вчера)
  await pool.query(`
    UPDATE goals
    SET streak = 0
    WHERE user_id = $1
      AND (
        last_completed_at IS NULL
        OR last_completed_at < $2
      )
  `, [userId, yesterdayUTC]);
}

/**
 * Вызывается при нажатии "Отметить ✓".
 * Возвращает новые значения { streak, completed, last_completed_at }.
 */
async function markGoalCompleted(goalId, userId) {
  const todayUTC = toDateString(new Date());

  // Получаем текущее состояние цели
  const { rows } = await pool.query(
    'SELECT streak, completed, last_completed_at FROM goals WHERE id = $1 AND user_id = $2',
    [goalId, userId]
  );
  if (!rows.length) return null;

  const goal = rows[0];

  // Уже отмечена сегодня — снимаем отметку (toggle)
  if (goal.last_completed_at && toDateString(goal.last_completed_at) === todayUTC) {
    const yesterdayUTC = toDateString(new Date(Date.now() - 86400000));
    // Откатываем streak на 1, но не ниже 0
    const newStreak = Math.max(0, goal.streak - 1);
    const result = await pool.query(`
      UPDATE goals
      SET completed         = FALSE,
          streak            = $1,
          last_completed_at = $2
      WHERE id = $3 AND user_id = $4
      RETURNING *
    `, [newStreak, newStreak > 0 ? yesterdayUTC : null, goalId, userId]);
    return result.rows[0];
  }

  // Считаем новый streak
  const yesterdayUTC = toDateString(new Date(Date.now() - 86400000));
  const lastDate     = goal.last_completed_at ? toDateString(goal.last_completed_at) : null;
  const newStreak    = lastDate === yesterdayUTC ? goal.streak + 1 : 1;

  const result = await pool.query(`
    UPDATE goals
    SET completed         = TRUE,
        streak            = $1,
        last_completed_at = $2
    WHERE id = $3 AND user_id = $4
    RETURNING *
  `, [newStreak, todayUTC, goalId, userId]);

  return result.rows[0];
}

// Приводим дату к строке 'YYYY-MM-DD' в UTC
function toDateString(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = { resetExpiredGoals, markGoalCompleted };
