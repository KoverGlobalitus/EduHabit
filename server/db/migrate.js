const pool = require('./pool');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      email      VARCHAR(255) UNIQUE NOT NULL,
      password   VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS goals (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title               VARCHAR(255) NOT NULL,
      description         TEXT,
      frequency           VARCHAR(50) NOT NULL DEFAULT 'Ежедневно',
      streak              INTEGER NOT NULL DEFAULT 0,
      completed           BOOLEAN NOT NULL DEFAULT FALSE,
      last_completed_at   DATE DEFAULT NULL,
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Добавить поле если таблица уже существовала (для существующих БД)
  await pool.query(`
    ALTER TABLE goals
      ADD COLUMN IF NOT EXISTS last_completed_at DATE DEFAULT NULL;
  `);

  console.log('✅ Таблицы созданы (или уже существуют)');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Ошибка миграции:', err); process.exit(1); });
