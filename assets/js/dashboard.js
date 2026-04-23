/* ═══════════════════════════════════════════════════════
   EduHabit — dashboard.js  (переписанная логика)
   ═══════════════════════════════════════════════════════ */

/* ─── Init ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadGoals();
  bindEvents();
  document.getElementById('footer-year').textContent = new Date().getFullYear();
});

/* ─── Auth ──────────────────────────────────────────── */
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { redirect('/login'); return; }
    const { user } = await res.json();
    document.querySelector('.user-name span').textContent = user.name;
  } catch {
    redirect('/login');
  }
}

function redirect(path) {
  document.body.style.transition = 'opacity 0.35s ease';
  document.body.style.opacity = '0';
  setTimeout(() => { window.location.href = path; }, 350);
}

/* ─── Загрузка целей ────────────────────────────────── */
async function loadGoals() {
  try {
    const res = await fetch('/api/goals');
    if (!res.ok) return;
    const { goals } = await res.json();
    const list = document.getElementById('goals-list');
    list.innerHTML = '';
    goals.forEach(g => list.appendChild(buildCard(g)));
    updateStats();
  } catch (err) {
    console.error('loadGoals:', err);
    showToast('Не удалось загрузить цели', 'error');
  }
}

/* ─── Рендер карточки ───────────────────────────────── */
function buildCard(goal) {
  const card = document.createElement('div');
  card.className = 'goal-card' + (goal.completed ? ' completed' : '');
  card.dataset.id     = goal.id;
  card.dataset.streak = goal.streak;

  const lastDone = goal.last_completed_at
    ? `<span class="last-done">последний раз: ${fmtDate(goal.last_completed_at)}</span>`
    : '';

  card.innerHTML = `
    <div class="goal-info">
      <h3 class="goal-title">${esc(goal.title)}
        <span class="frequency-badge daily">${esc(goal.frequency)}</span>
      </h3>
      <p class="goal-desc">${esc(goal.description || '—')}</p>
      ${lastDone}
    </div>
    <div class="goal-actions">
      <button class="complete-btn" data-action="toggle">
        ${goal.completed ? '✓ Выполнено' : 'Отметить ✓'}
      </button>
      <span class="streak">🔥 ${goal.streak} дн. подряд</span>
      <div class="goal-actions-row">
        <button class="edit-btn"   data-action="edit">✏ Изменить</button>
        <button class="delete-btn" data-action="delete">✕ Удалить</button>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    card.style.animation = 'goalEntrance 0.6s cubic-bezier(0.34,1.3,0.64,1) both';
  });

  return card;
}

/* ─── Event delegation ──────────────────────────────── */
function bindEvents() {
  document.getElementById('goals-list').addEventListener('click', e => {
    const btn    = e.target.closest('[data-action]');
    if (!btn) return;
    const card   = btn.closest('.goal-card');
    const action = btn.dataset.action;
    if (action === 'toggle') handleToggle(card, btn);
    if (action === 'edit')   openEditModal(card);
    if (action === 'delete') handleDelete(card, btn);
  });

  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-add-goal').addEventListener('click', openAddModal);
  document.getElementById('btn-empty-add').addEventListener('click', openAddModal);

  // Модалка добавления
  document.getElementById('modal-overlay')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeAddModal(); });
  document.getElementById('modal-cancel').addEventListener('click', closeAddModal);
  document.getElementById('modal-save').addEventListener('click', saveNewGoal);

  // Модалка редактирования
  document.getElementById('edit-modal-overlay')
    .addEventListener('click', e => { if (e.target === e.currentTarget) closeEditModal(); });
  document.getElementById('edit-modal-cancel').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal-save').addEventListener('click', saveEditedGoal);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeAddModal(); closeEditModal(); }
  });
}

/* ═══════════════════════════════════════════════════════
   TOGGLE
   ═══════════════════════════════════════════════════════ */
async function handleToggle(card, btn) {
  const goalId = card.dataset.id;
  btn.disabled = true;
  btn.classList.add('bouncing');
  btn.addEventListener('animationend', () => btn.classList.remove('bouncing'), { once: true });

  try {
    const res = await fetch(`/api/goals/${goalId}/toggle`, { method: 'PATCH' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Ошибка. Попробуйте снова', 'error');
      return;
    }

    const { goal } = await res.json();
    card.dataset.streak = goal.streak;
    card.querySelector('.streak').textContent = `🔥 ${goal.streak} дн. подряд`;

    let lastDoneEl = card.querySelector('.last-done');
    if (goal.last_completed_at) {
      if (!lastDoneEl) {
        lastDoneEl = document.createElement('span');
        lastDoneEl.className = 'last-done';
        card.querySelector('.goal-info').appendChild(lastDoneEl);
      }
      lastDoneEl.textContent = `последний раз: ${fmtDate(goal.last_completed_at)}`;
    } else if (lastDoneEl) {
      lastDoneEl.remove();
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
    console.error('toggle:', err);
    showToast('Нет соединения с сервером', 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ═══════════════════════════════════════════════════════
   DELETE — исправленная логика
   1) Блокируем кнопку
   2) Запрос на сервер
   3) Если OK → анимация → удалить DOM
   4) Если ошибка → разблокировать, показать ошибку
   ═══════════════════════════════════════════════════════ */
async function handleDelete(card, btn) {
  const goalId = card.dataset.id;

  // Немедленно блокируем — защита от двойного клика
  btn.disabled = true;

  try {
    const res = await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Не удалось удалить цель', 'error');
      btn.disabled = false;
      return;
    }

    // Сервер подтвердил → анимируем и удаляем из DOM
    card.classList.add('deleting');

    const removeCard = () => {
      if (card.isConnected) {
        card.remove();
        updateStats();
      }
    };

    card.addEventListener('animationend', removeCard, { once: true });
    setTimeout(removeCard, 700); // fallback если CSS-анимация не сработала

    showToast('Цель удалена');
  } catch (err) {
    console.error('delete:', err);
    showToast('Нет соединения с сервером', 'error');
    btn.disabled = false;
  }
}

/* ═══════════════════════════════════════════════════════
   EDIT MODAL
   ═══════════════════════════════════════════════════════ */
let editingGoalId = null;

function openEditModal(card) {
  editingGoalId = card.dataset.id;

  const titleEl   = card.querySelector('.goal-title');
  const titleText = [...titleEl.childNodes]
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent.trim())
    .join('');

  const desc = card.querySelector('.goal-desc').textContent.trim();
  const freq = card.querySelector('.frequency-badge').textContent.trim();

  document.getElementById('edit-goal-name').value = titleText;
  document.getElementById('edit-goal-desc').value = desc === '—' ? '' : desc;
  document.getElementById('edit-goal-freq').value = freq;

  document.getElementById('edit-modal-overlay').classList.add('visible');
  setTimeout(() => document.getElementById('edit-goal-name').focus(), 300);
}

function closeEditModal() {
  document.getElementById('edit-modal-overlay').classList.remove('visible');
  editingGoalId = null;
}

async function saveEditedGoal() {
  const title = document.getElementById('edit-goal-name').value.trim();
  const desc  = document.getElementById('edit-goal-desc').value.trim();
  const freq  = document.getElementById('edit-goal-freq').value;

  if (!title) { highlight(document.getElementById('edit-goal-name')); return; }

  const btn = document.getElementById('edit-modal-save');
  setBtnLoading(btn, true);

  try {
    const res = await fetch(`/api/goals/${editingGoalId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, description: desc || null, frequency: freq }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Ошибка сохранения', 'error');
      return;
    }

    const { goal } = await res.json();

    // Обновляем карточку данными с сервера
    const card = document.querySelector(`.goal-card[data-id="${editingGoalId}"]`);
    if (card) {
      const titleNode = card.querySelector('.goal-title');
      const badge     = titleNode.querySelector('.frequency-badge');
      titleNode.textContent = '';
      titleNode.appendChild(document.createTextNode(goal.title + ' '));
      badge.textContent = goal.frequency;
      titleNode.appendChild(badge);
      card.querySelector('.goal-desc').textContent = goal.description || '—';
    }

    closeEditModal();
    showToast('✓ Цель обновлена');
  } catch (err) {
    console.error('saveEdit:', err);
    showToast('Нет соединения с сервером', 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

/* ═══════════════════════════════════════════════════════
   ADD MODAL
   ═══════════════════════════════════════════════════════ */
function openAddModal() {
  document.getElementById('modal-overlay').classList.add('visible');
  setTimeout(() => document.getElementById('goal-name').focus(), 300);
}

function closeAddModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  document.getElementById('goal-name').value = '';
  document.getElementById('goal-desc').value = '';
}

async function saveNewGoal() {
  const title = document.getElementById('goal-name').value.trim();
  const desc  = document.getElementById('goal-desc').value.trim();
  const freq  = document.getElementById('goal-freq').value;

  if (!title) { highlight(document.getElementById('goal-name')); return; }

  const btn = document.getElementById('modal-save');
  setBtnLoading(btn, true);

  try {
    const res = await fetch('/api/goals', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, description: desc || null, frequency: freq }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Ошибка создания', 'error');
      return;
    }

    const { goal } = await res.json();
    document.getElementById('goals-list').appendChild(buildCard(goal));
    closeAddModal();
    updateStats();
    showToast('🎯 Новая цель добавлена!');
  } catch (err) {
    console.error('saveGoal:', err);
    showToast('Нет соединения с сервером', 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

/* ═══════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════ */
function updateStats() {
  const cards     = [...document.querySelectorAll('.goal-card')];
  const total     = cards.length;
  const done      = cards.filter(c => c.classList.contains('completed')).length;
  const maxStreak = Math.max(0, ...cards.map(c => +c.dataset.streak || 0));

  animateCount(document.getElementById('stat-total'), total);
  document.getElementById('stat-done').textContent = `${done}/${total}`;
  animateCount(document.getElementById('stat-streak'), maxStreak, ' 🔥', 1000);

  const hasCards = total > 0;
  document.getElementById('empty-state').classList.toggle('visible', !hasCards);
  const howto = document.getElementById('howto-section');
  if (howto) howto.style.display = hasCards ? 'none' : 'block';
}

function animateCount(el, to, suffix = '', duration = 700) {
  const from  = parseInt(el.textContent) || 0;
  const start = performance.now();
  (function step(now) {
    const p    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * ease) + suffix;
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

/* ─── Logout ─────────────────────────────────────────── */
async function handleLogout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  redirect('/login');
}

/* ─── Helpers ────────────────────────────────────────── */
function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function highlight(input) {
  input.style.borderColor = 'var(--danger)';
  setTimeout(() => (input.style.borderColor = ''), 1500);
}

function setBtnLoading(btn, loading) {
  btn.disabled    = loading;
  btn.textContent = loading ? '...' : (btn.dataset.label || btn.textContent);
}

let toastTimer;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show' + (type === 'error' ? ' toast-error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ─── Confetti ───────────────────────────────────────── */
function spawnConfetti(origin) {
  const rect   = origin.getBoundingClientRect();
  const cx     = rect.left + rect.width / 2;
  const cy     = rect.top  + rect.height / 2;
  const colors = ['#4fffb0', '#4d9fff', '#ff9240', '#ff5e7a', '#fff'];

  for (let i = 0; i < 24; i++) {
    const el    = document.createElement('div');
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * 100 + 40;
    const size  = Math.random() * 7 + 3;
    el.style.cssText = `
      position:fixed;left:${cx}px;top:${cy}px;
      width:${size}px;height:${size}px;
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
    const s = document.createElement('style');
    s.id = 'confetti-style';
    s.textContent = `@keyframes confettiOut {
      from { transform:translate(-50%,-50%) scale(1); opacity:1; }
      to   { transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(0.1); opacity:0; }
    }`;
    document.head.appendChild(s);
  }
}
