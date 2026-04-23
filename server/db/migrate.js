require('dotenv').config();
const pool = require('./pool');

async function migrate() {
  // ── users ────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(100)  NOT NULL,
      email      VARCHAR(255)  UNIQUE NOT NULL,
      password   VARCHAR(255)  NOT NULL,
      created_at TIMESTAMPTZ   DEFAULT NOW()
    );
  `);

  // ── goals ────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id                SERIAL PRIMARY KEY,
      user_id           INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title             VARCHAR(255) NOT NULL,
      description       TEXT,
      frequency         VARCHAR(50)  NOT NULL DEFAULT 'Ежедневно',
      streak            INTEGER      NOT NULL DEFAULT 0,
      completed         BOOLEAN      NOT NULL DEFAULT FALSE,
      last_completed_at DATE         DEFAULT NULL,
      created_at        TIMESTAMPTZ  DEFAULT NOW(),
      updated_at        TIMESTAMPTZ  DEFAULT NOW()
    );
  `);

  // ── goal_completions (история выполнений) ────────────────
  // Каждая строка = один день когда цель была выполнена
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goal_completions (
      id        SERIAL PRIMARY KEY,
      goal_id   INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      done_date DATE    NOT NULL,
      UNIQUE(goal_id, done_date)
    );
  `);

  // ── Добавляем колонки если их нет (безопасная миграция) ──
  await pool.query(`
    ALTER TABLE goals
      ADD COLUMN IF NOT EXISTS last_completed_at DATE DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `);

  // ── Индексы для быстрого поиска ──────────────────────────
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_completions_goal_id ON goal_completions(goal_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_completions_done_date ON goal_completions(done_date);`);

  console.log('✅ Миграция выполнена успешно');
}

migrate()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ Ошибка:', err); process.exit(1); });
