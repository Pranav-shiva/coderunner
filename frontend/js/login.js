// ── login.js ──
// Handles login form validation and POST /api/auth/login

const API_BASE = 'http://localhost:3000'; // Change to your EC2 URL in production

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  setTimeout(() => { t.className = ''; }, 3000);
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('show', !!msg);
  const input = el.previousElementSibling;
  if (input && input.tagName === 'INPUT') input.classList.toggle('error', !!msg);
}

function clearErrors() {
  ['emailError', 'passwordError'].forEach(id => setError(id, ''));
  const fe = document.getElementById('formError');
  if (fe) { fe.textContent = ''; fe.classList.remove('show'); }
}

function setLoading(loading) {
  const btn = document.getElementById('loginBtn');
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

function validateForm() {
  let valid = true;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email) {
    setError('emailError', 'Email is required'); valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('emailError', 'Enter a valid email'); valid = false;
  }

  if (!password) {
    setError('passwordError', 'Password is required'); valid = false;
  }

  return valid;
}

async function handleLogin() {
  clearErrors();
  if (!validateForm()) return;

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok && data.token) {
      // Store JWT token
      localStorage.setItem('cr_token', data.token);
      localStorage.setItem('cr_user', JSON.stringify({ email, id: data.userId }));
      showToast('Login successful — redirecting...', 'success');
      setTimeout(() => { window.location.href = 'editor.html'; }, 800);
    } else {
      const fe = document.getElementById('formError');
      fe.textContent = data.message || 'Invalid email or password.';
      fe.classList.add('show');
    }
  } catch (err) {
    const fe = document.getElementById('formError');
    fe.textContent = 'Cannot reach server. Is the backend running?';
    fe.classList.add('show');
  } finally {
    setLoading(false);
  }
}

// Enter key submits
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin();
});

// If already logged in, go straight to editor
if (localStorage.getItem('cr_token')) {
  window.location.href = 'editor.html';
}
