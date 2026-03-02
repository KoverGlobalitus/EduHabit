/* ── Particles ──────────────────────────────────── */
const canvas = document.getElementById('particles');
const ctx    = canvas.getContext('2d');
let W = canvas.width = innerWidth, H = canvas.height = innerHeight;
window.addEventListener('resize', () => {
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
});

const particles = Array.from({ length: 70 }, () => mkParticle(true));

function mkParticle(random) {
  return {
    x:     Math.random() * W,
    y:     random ? Math.random() * H : H + 10,
    vx:    (Math.random() - 0.5) * 0.3,
    vy:    -(Math.random() * 0.4 + 0.1),
    r:     Math.random() * 1.5 + 0.5,
    alpha: Math.random() * 0.4 + 0.1,
    color: Math.random() > 0.5 ? '79,255,176' : '77,159,255',
    life:  random ? Math.random() * 300 : 0,
    max:   300 + Math.random() * 200,
  };
}

(function loop() {
  ctx.clearRect(0, 0, W, H);
  particles.forEach((p, i) => {
    p.life++;
    if (p.life > p.max) { particles[i] = mkParticle(false); return; }
    const t    = p.life / p.max;
    const fade = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
    p.x += p.vx; p.y += p.vy;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${p.color},${p.alpha * fade})`;
    ctx.fill();
  });
  requestAnimationFrame(loop);
})();

/* ── Card tilt ──────────────────────────────────── */
const card = document.querySelector('.auth-card');
document.addEventListener('mousemove', e => {
  const r  = card.getBoundingClientRect();
  const dx = (e.clientX - r.left - r.width / 2) / r.width;
  const dy = (e.clientY - r.top - r.height / 2) / r.height;
  card.style.transform = `perspective(900px) rotateY(${dx * 6}deg) rotateX(${-dy * 4}deg) translateZ(6px)`;
});
document.addEventListener('mouseleave', () => {
  card.style.transition = 'transform 0.6s ease';
  card.style.transform  = '';
  setTimeout(() => (card.style.transition = ''), 600);
});

/* ── Tabs ───────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.tab === 'login') {
      document.getElementById('form-register').classList.remove('visible');
      document.getElementById('form-login').classList.remove('hidden');
    } else {
      document.getElementById('form-login').classList.add('hidden');
      document.getElementById('form-register').classList.add('visible');
    }
  });
});

/* ── Spin keyframe ──────────────────────────────── */
const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(spinStyle);

/* ── Helpers ────────────────────────────────────── */
function setLoading(btn, loading) {
  if (loading) {
    btn._orig     = btn.innerHTML;
    btn.innerHTML = '<span style="display:inline-block;animation:spin 0.6s linear infinite">⟳</span>';
    btn.disabled  = true;
  } else {
    btn.innerHTML = btn._orig;
    btn.disabled  = false;
  }
}

function showError(formId, message) {
  let el = document.querySelector(`#${formId} .form-error`);
  if (!el) {
    el            = document.createElement('p');
    el.className  = 'form-error';
    el.style.cssText = 'color:var(--danger,#ff5e7a);font-size:13px;margin-top:10px;text-align:center';
    document.getElementById(formId).appendChild(el);
  }
  el.textContent = message;
}

function goToDashboard() {
  document.body.style.transition = 'opacity 0.4s ease';
  document.body.style.opacity    = '0';
  setTimeout(() => { window.location.href = '/dashboard'; }, 400);
}

/* ── API: Войти ─────────────────────────────────── */
async function handleLogin(btn) {
  const email    = document.querySelector('#form-login input[type="email"]').value.trim();
  const password = document.querySelector('#form-login input[type="password"]').value;

  if (!email || !password) { showError('form-login', 'Заполните все поля'); return; }

  setLoading(btn, true);
  try {
    const res  = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) { showError('form-login', data.error || 'Ошибка входа'); return; }
    goToDashboard();
  } catch {
    showError('form-login', 'Нет соединения с сервером');
  } finally {
    setLoading(btn, false);
  }
}

/* ── API: Зарегистрироваться ────────────────────── */
async function handleRegister(btn) {
  const name     = document.querySelector('#form-register input[type="text"]').value.trim();
  const email    = document.querySelector('#form-register input[type="email"]').value.trim();
  const password = document.querySelector('#form-register input[type="password"]').value;

  if (!name || !email || !password) { showError('form-register', 'Заполните все поля'); return; }

  setLoading(btn, true);
  try {
    const res  = await fetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) { showError('form-register', data.error || 'Ошибка регистрации'); return; }
    goToDashboard();
  } catch {
    showError('form-register', 'Нет соединения с сервером');
  } finally {
    setLoading(btn, false);
  }
}
