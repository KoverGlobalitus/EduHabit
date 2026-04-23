/**
 * streaks.js — вся логика стриков с учётом частоты (frequency)
 *
 * Ежедневно  → нужно выполнять каждый день
 * По будням  → нужно выполнять пн-пт; сб-вс не требуются и не ломают streak
 * Еженедельно → достаточно 1 раза за ISO-неделю (пн-вс)
 */

const pool = require('./pool');

/* ════════════════════════════════════════════════════════
   resetExpiredGoals — вызывается при GET /api/goals
   ════════════════════════════════════════════════════════ */
async function resetExpiredGoals(userId) {
  const todayUTC     = toDateString(new Date());
  const yesterdayUTC = toDateString(new Date(Date.now() - 86_400_000));

  /* ── ЕЖЕДНЕВНО: сброс completed ──────────────────────── */
  await pool.query(`
    UPDATE goals SET completed = FALSE, updated_at = NOW()
    WHERE user_id = $1 AND completed = TRUE AND frequency = 'Ежедневно'
      AND (last_completed_at IS NULL OR last_completed_at < $2)
  `, [userId, todayUTC]);

  /* ── ЕЖЕДНЕВНО: сброс streak ─────────────────────────── */
  await pool.query(`
    UPDATE goals SET streak = 0, updated_at = NOW()
    WHERE user_id = $1 AND frequency = 'Ежедневно'
      AND (last_completed_at IS NULL OR last_completed_at < $2)
  `, [userId, yesterdayUTC]);

  /* ── ПО БУДНЯМ: сброс completed (только в будни) ─────── */
  await pool.query(`
    UPDATE goals SET completed = FALSE, updated_at = NOW()
    WHERE user_id = $1 AND completed = TRUE AND frequency = 'По будням'
      AND EXTRACT(DOW FROM NOW() AT TIME ZONE 'UTC') BETWEEN 1 AND 5
      AND (last_completed_at IS NULL OR last_completed_at < $2)
  `, [userId, todayUTC]);

  /* ── ПО БУДНЯМ: сброс streak
       Последний обязательный будний день:
         Пн (DOW=1) → пятница (3 дня назад)
         Вс (DOW=0) → пятница (2 дня назад)
         Вт-Сб      → вчера
  ────────────────────────────────────────────────────── */
  await pool.query(`
    UPDATE goals SET streak = 0, updated_at = NOW()
    WHERE user_id = $1 AND frequency = 'По будням'
      AND (
        last_completed_at IS NULL
        OR last_completed_at < (
          CURRENT_DATE - (
            CASE EXTRACT(DOW FROM NOW() AT TIME ZONE 'UTC')::INTEGER
              WHEN 1 THEN 3
              WHEN 0 THEN 2
              ELSE 1
            END
          )
        )
      )
  `, [userId]);

  /* ── ЕЖЕНЕДЕЛЬНО: сброс completed (если не выполнена на этой неделе) */
  await pool.query(`
    UPDATE goals SET completed = FALSE, updated_at = NOW()
    WHERE user_id = $1 AND completed = TRUE AND frequency = 'Еженедельно'
      AND (
        last_completed_at IS NULL
        OR last_completed_at < DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC')::DATE
      )
  `, [userId]);

  /* ── ЕЖЕНЕДЕЛЬНО: сброс streak (если пропущена прошлая неделя) */
  await pool.query(`
    UPDATE goals SET streak = 0, updated_at = NOW()
    WHERE user_id = $1 AND frequency = 'Еженедельно'
      AND (
        last_completed_at IS NULL
        OR last_completed_at < (
          DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days'
        )::DATE
      )
  `, [userId]);
}

/* ════════════════════════════════════════════════════════
   markGoalCompleted — toggle выполнения цели
   ════════════════════════════════════════════════════════ */
async function markGoalCompleted(goalId, userId) {
  const now      = new Date();
  const todayUTC = toDateString(now);

  const { rows } = await pool.query(
    'SELECT streak, completed, last_completed_at, frequency FROM goals WHERE id = $1 AND user_id = $2',
    [goalId, userId]
  );
  if (!rows.length) return null;

  const goal      = rows[0];
  const lastDate  = goal.last_completed_at ? toDateString(goal.last_completed_at) : null;
  const doneToday = lastDate === todayUTC;

  /* ── Toggle OFF: снять отметку ──────────────────────── */
  if (doneToday) {
    await pool.query(
      'DELETE FROM goal_completions WHERE goal_id = $1 AND done_date = $2',
      [goalId, todayUTC]
    );

    // Предыдущая дата выполнения (для last_completed_at)
    const prev = await pool.query(
      'SELECT done_date FROM goal_completions WHERE goal_id = $1 ORDER BY done_date DESC LIMIT 1',
      [goalId]
    );
    const prevDate  = prev.rows.length ? toDateString(prev.rows[0].done_date) : null;
    const newStreak = Math.max(0, goal.streak - 1);

    const result = await pool.query(`
      UPDATE goals
      SET completed = FALSE, streak = $1, last_completed_at = $2, updated_at = NOW()
      WHERE id = $3 AND user_id = $4 RETURNING *
    `, [newStreak, prevDate, goalId, userId]);

    return result.rows[0];
  }

  /* ── Toggle ON: отметить выполнение ─────────────────── */
  await pool.query(
    'INSERT INTO goal_completions (goal_id, user_id, done_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [goalId, userId, todayUTC]
  );

  const newStreak = calcNewStreak(goal, now, lastDate);

  const result = await pool.query(`
    UPDATE goals
    SET completed = TRUE, streak = $1, last_completed_at = $2, updated_at = NOW()
    WHERE id = $3 AND user_id = $4 RETURNING *
  `, [newStreak, todayUTC, goalId, userId]);

  return result.rows[0];
}

/* ════════════════════════════════════════════════════════
   getCompletions — история для мини-календаря
   ════════════════════════════════════════════════════════ */
async function getCompletions(goalIds, days = 21) {
  if (!goalIds.length) return {};

  const cutoff = toDateString(new Date(Date.now() - days * 86_400_000));
  const { rows } = await pool.query(
    `SELECT goal_id, done_date::text AS done_date
     FROM goal_completions
     WHERE goal_id = ANY($1) AND done_date >= $2
     ORDER BY done_date DESC`,
    [goalIds, cutoff]
  );

  const map = {};
  rows.forEach(r => {
    if (!map[r.goal_id]) map[r.goal_id] = [];
    map[r.goal_id].push(r.done_date);
  });
  return map;
}

/* ════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════ */

/** Вычислить новый streak при отметке выполнения */
function calcNewStreak(goal, now, lastDate) {
  const freq = goal.frequency;

  if (freq === 'Ежедневно') {
    const yesterdayUTC = toDateString(new Date(now - 86_400_000));
    return lastDate === yesterdayUTC ? goal.streak + 1 : 1;
  }

  if (freq === 'По будням') {
    const prevRequired = getPrevRequiredWeekday(now);
    return lastDate === prevRequired ? goal.streak + 1 : 1;
  }

  if (freq === 'Еженедельно') {
    // Streak растёт если выполняли на прошлой неделе
    const thisWeekStart = getWeekStart(now);           // пн текущей недели
    const lastWeekStart = new Date(thisWeekStart - 7 * 86_400_000);
    const lastWeekEnd   = new Date(thisWeekStart - 86_400_000); // вс прошлой недели
    if (lastDate && lastDate >= toDateString(lastWeekStart) && lastDate <= toDateString(lastWeekEnd)) {
      return goal.streak + 1;
    }
    return 1;
  }

  return 1;
}

/** Предыдущий обязательный будний день перед сегодня */
function getPrevRequiredWeekday(now) {
  const dow = now.getUTCDay(); // 0=Вс, 1=Пн … 6=Сб
  let daysBack;
  if      (dow === 0) daysBack = 2; // Вс → Пт
  else if (dow === 1) daysBack = 3; // Пн → Пт
  else                daysBack = 1; // Вт-Сб → вчера
  return toDateString(new Date(now - daysBack * 86_400_000));
}

/** Начало ISO-недели (понедельник) для даты */
function getWeekStart(date) {
  const d   = new Date(date);
  const dow = d.getUTCDay();                           // 0=Вс
  const diff = (dow === 0 ? -6 : 1 - dow);            // сдвиг до Пн
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
}

/** Дата → строка 'YYYY-MM-DD' в UTC */
function toDateString(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = { resetExpiredGoals, markGoalCompleted, getCompletions };
