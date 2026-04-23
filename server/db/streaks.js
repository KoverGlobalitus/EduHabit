const pool = require('./pool');

/**
 * Сбрасывает просроченные цели при загрузке дашборда.
 *
 * Правила:
 *  last_completed_at = сегодня   → не трогаем (уже выполнена)
 *  last_completed_at = вчера     → сбрасываем completed=false, streak остаётся
 *                                  (пользователь ещё может выполнить сегодня)
 *  last_completed_at < вчера     → сбрасываем completed=false и streak=0 (пропуск)
 *  last_completed_at IS NULL     → сбрасываем streak=0
 */
async function resetExpiredGoals(userId) {
  const todayUTC     = toDateString(new Date());
  const yesterdayUTC = toDateString(new Date(Date.now() - 86_400_000));

  // 1) Снять флаг completed у тех, кто выполнен НЕ сегодня
  await pool.query(`
    UPDATE goals
    SET completed  = FALSE,
        updated_at = NOW()
    WHERE user_id   = $1
      AND completed = TRUE
      AND (last_completed_at IS NULL OR last_completed_at < $2)
  `, [userId, todayUTC]);

  // 2) Обнулить streak у тех, кто пропустил и вчера (last < вчера или NULL)
  await pool.query(`
    UPDATE goals
    SET streak     = 0,
        updated_at = NOW()
    WHERE user_id = $1
      AND (last_completed_at IS NULL OR last_completed_at < $2)
  `, [userId, yesterdayUTC]);
}

/**
 * Toggle выполнения цели.
 * Если цель уже отмечена сегодня — снимаем отметку.
 * Если не отмечена — отмечаем и пересчитываем streak.
 */
async function markGoalCompleted(goalId, userId) {
  const todayUTC     = toDateString(new Date());
  const yesterdayUTC = toDateString(new Date(Date.now() - 86_400_000));

  const { rows } = await pool.query(
    'SELECT streak, completed, last_completed_at FROM goals WHERE id = $1 AND user_id = $2',
    [goalId, userId]
  );
  if (!rows.length) return null;

  const goal       = rows[0];
  const lastDate   = goal.last_completed_at ? toDateString(goal.last_completed_at) : null;
  const doneToday  = lastDate === todayUTC;

  if (doneToday) {
    // ── Снять отметку (toggle off) ───────────────────────
    const newStreak = Math.max(0, goal.streak - 1);
    const result = await pool.query(`
      UPDATE goals
      SET completed         = FALSE,
          streak            = $1,
          last_completed_at = $2,
          updated_at        = NOW()
      WHERE id = $3 AND user_id = $4
      RETURNING *
    `, [newStreak, newStreak > 0 ? yesterdayUTC : null, goalId, userId]);
    return result.rows[0];
  }

  // ── Поставить отметку (toggle on) ────────────────────
  // Streak растёт только если выполняли вчера (или это первый раз)
  const newStreak = lastDate === yesterdayUTC ? goal.streak + 1 : 1;

  const result = await pool.query(`
    UPDATE goals
    SET completed         = TRUE,
        streak            = $1,
        last_completed_at = $2,
        updated_at        = NOW()
    WHERE id = $3 AND user_id = $4
    RETURNING *
  `, [newStreak, todayUTC, goalId, userId]);

  return result.rows[0];
}

/** Приводит дату к строке 'YYYY-MM-DD' в UTC */
function toDateString(date) {
  const d = new Date(date);
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

module.exports = { resetExpiredGoals, markGoalCompleted };
