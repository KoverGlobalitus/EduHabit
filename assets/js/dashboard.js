/* ── Проверка авторизации при загрузке ──────────── */
(async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.href = '/login'; return; }
    const { user } = await res.json();
    document.querySelector('.user-name span').textContent = user.name;
  } catch {
    window.location.href = '/login';
  }
})();

/* ── Загрузка целей ─────────────────────────────── */
async function loadGoals() {
  try {
    const res = await fetch('/api/goals');
    if (!res.ok) return;
    const { goals } = await res.json();

    const list = document.getElementById('goals-list');
    list.innerHTML = '';
    goals.forEach(goal => renderGoalCard(goal));
    updateStats();
  } catch (err) {
    console.error('loadGoals error:', err);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(loadGoals, 300);
});

/* ── Рендер карточки ────────────────────────────── */
function renderGoalCard(goal) {
  const list = document.getElementById('goals-list');
  const card = document.createElement('div');
  card.className    = 'goal-card' + (goal.completed ? ' completed' : '');
  card.dataset.id     = goal.id;
  card.dataset.streak = goal.streak;
  card.dataset.done   = goal.completed;
  card.style.animationDelay = '0s';

  // Показываем дату последнего выполнения если есть
  const lastDoneLabel = goal.last_completed_at
    ? `<span class="last-done">последний раз: ${formatDate(goal.last_completed_at)}</span>`
    : '';

  card.innerHTML = `
    <div class="goal-info">
      <h3>${escHtml(goal.title)} <span class="frequency-badge daily">${escHtml(goal.frequency)}</span></h3>
      <p>${escHtml(goal.description || '—')}</p>
      ${lastDoneLabel}
    </div>
    <div class="goal-actions">
      <button class="complete-btn" onclick="toggleComplete(this)">
        ${goal.completed ? '✓ Выполнено' : 'Отметить ✓'}
      </button>
      <span class="streak">🔥 ${goal.streak} дн. подряд</span>
      <div class="goal-actions-row">
        <button class="edit-btn">✏ Изменить</button>
        <button class="delete-btn" onclick="deleteGoal(this)">✕ Удалить</button>
      </div>
    </div>
  `;
  list.appendChild(card);

  requestAnimationFrame(() => {
    card.style.animation = 'goalEntrance 0.6s cubic-bezier(0.34,1.3,0.64,1) both';
  });
}

/* ── Форматирование даты ────────────────────────── */
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Stats ──────────────────────────────────────── */
function animateCount(el, from, to, suffix = '', duration = 800) {
  const start = performance.now();
  function step(now) {
    const p    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * ease) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateStats() {
  const cards     = document.querySelectorAll('.goal-card');
  const total     = cards.length;
  const done      = [...cards].filter(c => c.classList.contains('completed')).length;
  const maxStreak = Math.max(0, ...[...cards].map(c => +c.dataset.streak || 0));

  animateCount(document.getElementById('stat-total'), 0, total);
  setTimeout(() => {
    document.getElementById('stat-done').textContent = `${done}/${total}`;
  }, 200);
  animateCount(document.getElementById('stat-streak'), 0, maxStreak, ' 🔥', 1000);
}

/* ── Toggle complete — сервер управляет стриком ─── */
async function toggleComplete(btn) {
  const card   = btn.closest('.goal-card');
  const goalId = card.dataset.id;

  btn.classList.add('bouncing');
  btn.addEventListener('animationend', () => btn.classList.remove('bouncing'), { once: true });
  btn.disabled = true;

  try {
    const res = await fetch(`/api/goals/${goalId}/toggle`, {
      method: 'PATCH',
    });
    if (!res.ok) return;
    const { goal } = await res.json();

    // Обновляем карточку данными с сервера
    card.dataset.done   = goal.completed;
    card.dataset.streak = goal.streak;
    card.querySelector('.streak').textContent = `🔥 ${goal.streak} дн. подряд`;

    // Обновить метку даты
    const lastDoneEl = card.querySelector('.last-done');
    if (goal.last_completed_at) {
      if (lastDoneEl) {
        lastDoneEl.textContent = `последний раз: ${formatDate(goal.last_completed_at)}`;
      } else {
        const p = document.createElement('span');
        p.className   = 'last-done';
        p.textContent = `последний раз: ${formatDate(goal.last_completed_at)}`;
        card.querySelector('.goal-info').appendChild(p);
      }
    }

    if (goal.completed) {
      card.classList.add('completed');
      btn.textContent = '✓ Выполнено';
      showToast('✓ Цель выполнена! Так держать 🔥');
      spawnConfetti(btn);
    } else {
      card.classList.remove('completed');
      btn.textContent = 'Отметить ✓';
      showToast('Цель снята с выполнения');
    }
    updateStats();
  } catch (err) {
    console.error('toggleComplete error:', err);
  } finally {
    btn.disabled = false;
  }
}

/* ── Delete ─────────────────────────────────────── */
async function deleteGoal(btn) {
  const card   = btn.closest('.goal-card');
  const goalId = card.dataset.id;

  card.classList.add('deleting');
  card.addEventListener('animationend', async () => {
    try {
      await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('deleteGoal error:', err);
    }
    card.remove();
    updateStats();
    showToast('Цель удалена');
  }, { once: true });
}

/* ── Modal ──────────────────────────────────────── */
function openModal() {
  document.getElementById('modal-overlay').classList.add('visible');
  setTimeout(() => document.getElementById('goal-name').focus(), 300);
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
}
function closeModalOutside(e) {
  if (e.target === e.currentTarget) closeModal();
}

async function saveGoal() {
  const title = document.getElementById('goal-name').value.trim();
  const desc  = document.getElementById('goal-desc').value.trim();
  const freq  = document.getElementById('goal-freq').value;

  if (!title) {
    document.getElementById('goal-name').style.borderColor = 'var(--danger)';
    setTimeout(() => (document.getElementById('goal-name').style.borderColor = ''), 1500);
    return;
  }

  try {
    const res = await fetch('/api/goals', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, description: desc, frequency: freq }),
    });
    if (!res.ok) return;
    const { goal } = await res.json();

    renderGoalCard(goal);
    closeModal();
    document.getElementById('goal-name').value = '';
    document.getElementById('goal-desc').value = '';
    updateStats();
    showToast('🎯 Новая цель добавлена!');
  } catch (err) {
    console.error('saveGoal error:', err);
  }
}

/* ── Toast ──────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ── Confetti ───────────────────────────────────── */
function spawnConfetti(origin) {
  const rect   = origin.getBoundingClientRect();
  const cx     = rect.left + rect.width / 2;
  const cy     = rect.top + rect.height / 2;
  const colors = ['#4fffb0', '#4d9fff', '#ff9240', '#ff5e7a', '#fff'];

  for (let i = 0; i < 24; i++) {
    const el    = document.createElement('div');
    const angle = (Math.random() * 360) * Math.PI / 180;
    const dist  = Math.random() * 100 + 40;
    const size  = Math.random() * 7 + 3;
    el.style.cssText = `
      position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      background:${colors[Math.floor(Math.random() * colors.length)]};
      pointer-events:none;z-index:500;
      transform:translate(-50%,-50%);
      animation:confettiOut 0.8s ${Math.random() * 0.2}s ease-out forwards;
      --tx:${Math.cos(angle) * dist}px;--ty:${Math.sin(angle) * dist}px;
    `;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  if (!document.getElementById('confetti-style')) {
    const s    = document.createElement('style');
    s.id       = 'confetti-style';
    s.textContent = `@keyframes confettiOut {
      from { transform:translate(-50%,-50%) scale(1); opacity:1; }
      to   { transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(0); opacity:0; }
    }`;
    document.head.appendChild(s);
  }
}

/* ── Logout ─────────────────────────────────────── */
async function handleLogout(btn) {
  btn.textContent = '...';
  await fetch('/api/auth/logout', { method: 'POST' });
  document.body.style.transition = 'opacity 0.4s ease';
  document.body.style.opacity    = '0';
  setTimeout(() => { window.location.href = '/login'; }, 450);
}

/* ── Keyboard ───────────────────────────────────── */
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
