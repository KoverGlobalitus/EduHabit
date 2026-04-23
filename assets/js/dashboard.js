/* ═══════════════════════════════════════════════════════════
   EduHabit v2.0 — dashboard.js
   Новое: частота, мини-календарь, история, фильтры, % выполнения
   ═══════════════════════════════════════════════════════════ */

/* ─── Глобальное состояние ───────────────────────────────── */
let allGoals    = [];   // полный список с сервера
let activeFilter = 'all';

/* ─── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadGoals();
  bindEvents();
  document.getElementById('footer-year').textContent = new Date().getFullYear();
});

/* ─── Auth ──────────────────────────────────────────────── */
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { redirect('/login'); return; }
    const { user } = await res.json();
    document.querySelector('.user-name span').textContent = user.name;
  } catch { redirect('/login'); }
}

function redirect(path) {
  document.body.style.transition = 'opacity 0.35s ease';
  document.body.style.opacity    = '0';
  setTimeout(() => { window.location.href = path; }, 350);
}

/* ─── Загрузка целей ────────────────────────────────────── */
async function loadGoals() {
  try {
    const res = await fetch('/api/goals');
    if (!res.ok) return;
    const { goals } = await res.json();
    allGoals = goals;
    renderFiltered();
  } catch (err) {
    console.error('loadGoals:', err);
    showToast('Не удалось загрузить цели', 'error');
  }
}

/* ─── Рендер с учётом фильтра ───────────────────────────── */
function renderFiltered() {
  const list = document.getElementById('goals-list');
  list.innerHTML = '';

  const filtered = allGoals.filter(g => {
    if (activeFilter === 'all')        return true;
    if (activeFilter === 'active')     return !g.completed;
    if (activeFilter === 'done')       return g.completed;
    return g.frequency === activeFilter;
  });

  filtered.forEach(g => list.appendChild(buildCard(g)));
  updateStats();
}

/* ─── Построение карточки ───────────────────────────────── */
function buildCard(goal) {
  const card = document.createElement('div');
  card.className    = 'goal-card' + (goal.completed ? ' completed' : '');
  card.dataset.id   = goal.id;
  card.dataset.streak = goal.streak;
  card.dataset.freq   = goal.frequency;

  const lastDone = goal.last_completed_at
    ? `<span class="last-done">последний раз: ${fmtDate(goal.last_completed_at)}</span>`
    : '';

  const freqClass = freqBadgeClass(goal.frequency);
  const calHtml   = buildCalendarHtml(goal);
  const barHtml   = buildProgressBar(goal);

  card.innerHTML = `
    <div class="goal-card-top">
      <div class="goal-info">
        <h3 class="goal-title">${esc(goal.title)}
          <span class="frequency-badge ${freqClass}">${esc(goal.frequency)}</span>
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
    </div>
    <div class="goal-card-bottom">
      ${calHtml}
      ${barHtml}
    </div>
  `;

  requestAnimationFrame(() => {
    card.style.animation = 'goalEntrance 0.5s cubic-bezier(0.34,1.3,0.64,1) both';
  });

  return card;
}

/* ─── Мини-календарь (21 день = 3 недели) ──────────────── */
function buildCalendarHtml(goal) {
  const doneSet = new Set(goal.completions || []);
  const today   = new Date();
  // Начинаем с понедельника 3 недели назад
  const startDate = getWeekStart(new Date(today - 14 * 86_400_000));
  const days      = 21;

  const dayLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  let headerHtml  = dayLabels.map(d => `<span class="cal-label">${d}</span>`).join('');
  let cellsHtml   = '';

  for (let i = 0; i < days; i++) {
    const d       = new Date(startDate.getTime() + i * 86_400_000);
    const dateStr = toDateStr(d);
    const dow     = d.getUTCDay();                  // 0=Вс, 6=Сб
    const isWeekend = dow === 0 || dow === 6;
    const isDone    = doneSet.has(dateStr);
    const isToday   = dateStr === toDateStr(today);
    const isFuture  = d > today;

    let cls = 'cal-day';
    if (isDone)    cls += ' done';
    if (isToday)   cls += ' today';
    if (isFuture)  cls += ' future';
    if (isWeekend && goal.frequency === 'По будням') cls += ' skip';

    cellsHtml += `<span class="${cls}" title="${dateStr}"></span>`;
  }

  return `
    <div class="mini-calendar">
      <div class="cal-header">${headerHtml}</div>
      <div class="cal-grid">${cellsHtml}</div>
    </div>
  `;
}

/* ─── Прогресс-бар (% за 30 дней) ──────────────────────── */
function buildProgressBar(goal) {
  const doneSet  = new Set(goal.completions || []);
  const today    = new Date();
  let required   = 0;
  let done       = 0;

  for (let i = 29; i >= 0; i--) {
    const d    = new Date(today.getTime() - i * 86_400_000);
    const dStr = toDateStr(d);
    const dow  = d.getUTCDay();
    const isWE = dow === 0 || dow === 6;

    if (goal.frequency === 'По будням' && isWE) continue; // выходные не считаются

    // Для еженедельных считаем только понедельники (1 обязательный день в неделю)
    if (goal.frequency === 'Еженедельно' && dow !== 1) continue;

    required++;
    if (doneSet.has(dStr)) done++;
  }

  if (required === 0) return '';
  const pct = Math.round(done / required * 100);
  const color = pct >= 80 ? 'var(--accent)' : pct >= 50 ? 'var(--streak)' : 'var(--danger)';

  return `
    <div class="progress-bar-wrap">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%; background:${color};"></div>
      </div>
      <span class="progress-label">${done}/${required} дней выполнено (${pct}%)</span>
    </div>
  `;
}

/* ─── Event delegation ──────────────────────────────────── */
function bindEvents() {
  // Список целей
  document.getElementById('goals-list').addEventListener('click', e => {
    const btn  = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('.goal-card');
    const act  = btn.dataset.action;
    if (act === 'toggle') handleToggle(card, btn);
    if (act === 'edit')   openEditModal(card);
    if (act === 'delete') handleDelete(card, btn);
  });

  // Фильтры
  document.getElementById('filter-bar').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderFiltered();
  });

  // Хедер
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Кнопки добавить
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

/* ═══════════════════════════════════════════════════════════
   TOGGLE
   ═══════════════════════════════════════════════════════════ */
async function handleToggle(card, btn) {
  const goalId = card.dataset.id;
  btn.disabled = true;
  btn.classList.add('bouncing');
  btn.addEventListener('animationend', () => btn.classList.remove('bouncing'), { once: true });

  try {
    const res = await fetch(`/api/goals/${goalId}/toggle`, { method: 'PATCH' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Ошибка. Попробуйте снова', 'error');
      return;
    }
    const { goal } = await res.json();

    // Обновляем в глобальном состоянии
    const idx = allGoals.findIndex(g => g.id == goalId);
    if (idx !== -1) {
      // Если цель выполнена — добавляем сегодня в completions
      const todayStr = toDateStr(new Date());
      const prevComp = allGoals[idx].completions || [];
      const newComp  = goal.completed
        ? [...new Set([todayStr, ...prevComp])]
        : prevComp.filter(d => d !== todayStr);
      allGoals[idx] = { ...goal, completions: newComp };
    }

    // Обновляем карточку
    card.dataset.streak = goal.streak;
    card.querySelector('.streak').textContent = `🔥 ${goal.streak} дн. подряд`;

    let lastEl = card.querySelector('.last-done');
    if (goal.last_completed_at) {
      if (!lastEl) {
        lastEl = document.createElement('span');
        lastEl.className = 'last-done';
        card.querySelector('.goal-info').appendChild(lastEl);
      }
      lastEl.textContent = `последний раз: ${fmtDate(goal.last_completed_at)}`;
    } else if (lastEl) { lastEl.remove(); }

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

    // Перерисовываем мини-календарь и прогресс
    if (idx !== -1) {
      const bottom = card.querySelector('.goal-card-bottom');
      bottom.innerHTML =
        buildCalendarHtml(allGoals[idx]) +
        buildProgressBar(allGoals[idx]);
    }

    updateStats();
  } catch (err) {
    console.error('toggle:', err);
    showToast('Нет соединения с сервером', 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ═══════════════════════════════════════════════════════════
   DELETE
   ═══════════════════════════════════════════════════════════ */
async function handleDelete(card, btn) {
  const goalId = card.dataset.id;
  btn.disabled = true;

  try {
    const res = await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Не удалось удалить', 'error');
      btn.disabled = false;
      return;
    }

    allGoals = allGoals.filter(g => g.id != goalId);

    card.classList.add('deleting');
    const remove = () => { if (card.isConnected) { card.remove(); updateStats(); } };
    card.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 700);
    showToast('Цель удалена');
  } catch (err) {
    console.error('delete:', err);
    showToast('Нет соединения с сервером', 'error');
    btn.disabled = false;
  }
}

/* ═══════════════════════════════════════════════════════════
   EDIT MODAL
   ═══════════════════════════════════════════════════════════ */
let editingGoalId = null;

function openEditModal(card) {
  editingGoalId = card.dataset.id;

  const titleEl   = card.querySelector('.goal-title');
  const titleText = [...titleEl.childNodes]
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent.trim()).join('');

  document.getElementById('edit-goal-name').value = titleText;
  document.getElementById('edit-goal-desc').value =
    card.querySelector('.goal-desc').textContent.trim() === '—' ? '' :
    card.querySelector('.goal-desc').textContent.trim();
  document.getElementById('edit-goal-freq').value = card.dataset.freq;

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
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Ошибка сохранения', 'error');
      return;
    }
    const { goal } = await res.json();

    // Обновляем глобальное состояние
    const idx = allGoals.findIndex(g => g.id == editingGoalId);
    if (idx !== -1) allGoals[idx] = { ...allGoals[idx], ...goal };

    // Перерисовываем карточку
    const card = document.querySelector(`.goal-card[data-id="${editingGoalId}"]`);
    if (card) {
      const titleNode = card.querySelector('.goal-title');
      const badge     = titleNode.querySelector('.frequency-badge');
      titleNode.textContent = '';
      titleNode.appendChild(document.createTextNode(goal.title + ' '));
      badge.textContent = goal.frequency;
      badge.className   = `frequency-badge ${freqBadgeClass(goal.frequency)}`;
      titleNode.appendChild(badge);
      card.querySelector('.goal-desc').textContent = goal.description || '—';
      card.dataset.freq = goal.frequency;
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

/* ═══════════════════════════════════════════════════════════
   ADD MODAL
   ═══════════════════════════════════════════════════════════ */
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
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Ошибка создания', 'error');
      return;
    }
    const { goal } = await res.json();
    allGoals.push(goal);
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

/* ═══════════════════════════════════════════════════════════
   STATS
   ═══════════════════════════════════════════════════════════ */
function updateStats() {
  // Считаем по видимым карточкам (с учётом фильтра)
  const cards     = [...document.querySelectorAll('.goal-card')];
  const total     = cards.length;
  const done      = cards.filter(c => c.classList.contains('completed')).length;
  const maxStreak = Math.max(0, ...cards.map(c => +c.dataset.streak || 0));

  animateCount(document.getElementById('stat-total'), total);
  document.getElementById('stat-done').textContent = `${done}/${total}`;
  animateCount(document.getElementById('stat-streak'), maxStreak, ' 🔥');

  // Общий % выполнения за 30 дней по всем целям
  const rateEl   = document.getElementById('stat-rate');
  let totalReq   = 0, totalDone = 0;
  const today    = new Date();

  allGoals.forEach(goal => {
    const doneSet = new Set(goal.completions || []);
    for (let i = 29; i >= 0; i--) {
      const d    = new Date(today.getTime() - i * 86_400_000);
      const dStr = toDateStr(d);
      const dow  = d.getUTCDay();
      const isWE = dow === 0 || dow === 6;
      if (goal.frequency === 'По будням' && isWE) continue;
      if (goal.frequency === 'Еженедельно' && dow !== 1) continue;
      totalReq++;
      if (doneSet.has(dStr)) totalDone++;
    }
  });

  rateEl.textContent = totalReq > 0
    ? `${Math.round(totalDone / totalReq * 100)}%`
    : '—';

  // Empty / howto state
  const hasCards = allGoals.length > 0;
  document.getElementById('empty-state').classList.toggle('visible', !hasCards);
  const howto = document.getElementById('howto-section');
  if (howto) howto.style.display = hasCards ? 'none' : 'block';

  // Показываем фильтры только если есть цели
  document.getElementById('filter-bar').style.display = hasCards ? 'flex' : 'none';
}

function animateCount(el, to, suffix = '', dur = 600) {
  const from  = parseInt(el.textContent) || 0;
  const start = performance.now();
  (function step(now) {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))) + suffix;
    if (p < 1) requestAnimationFrame(step);
  })(start);
}

/* ─── Logout ─────────────────────────────────────────────── */
async function handleLogout() {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  redirect('/login');
}

/* ─── Helpers ────────────────────────────────────────────── */
/** YYYY-MM-DD в локальном часовом поясе (для мини-календаря) */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Понедельник той же недели */
function getWeekStart(date) {
  const d   = new Date(date);
  const dow = d.getDay(); // 0=Вс
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function freqBadgeClass(freq) {
  if (freq === 'Еженедельно') return 'weekly';
  if (freq === 'По будням')   return 'weekdays';
  return 'daily';
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function highlight(input) {
  input.style.borderColor = 'var(--danger)';
  setTimeout(() => (input.style.borderColor = ''), 1500);
}

function setBtnLoading(btn, loading) {
  btn.disabled    = loading;
  btn.textContent = loading ? '...' : (btn.dataset.label || 'OK');
}

let toastTimer;
function showToast(msg, type = 'info') {
  const t     = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show' + (type === 'error' ? ' toast-error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ─── Confetti ───────────────────────────────────────────── */
function spawnConfetti(origin) {
  const rect   = origin.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const colors = ['#4fffb0', '#4d9fff', '#ff9240', '#ff5e7a', '#fff'];
  for (let i = 0; i < 24; i++) {
    const el    = document.createElement('div');
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * 100 + 40;
    const size  = Math.random() * 7 + 3;
    el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;
      width:${size}px;height:${size}px;
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      background:${colors[Math.floor(Math.random() * colors.length)]};
      pointer-events:none;z-index:500;transform:translate(-50%,-50%);
      animation:confettiOut 0.8s ${Math.random() * 0.2}s ease-out forwards;
      --tx:${Math.cos(angle) * dist}px;--ty:${Math.sin(angle) * dist}px;`;
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
