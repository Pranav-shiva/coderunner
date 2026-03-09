// ── signup.js ──
// Handles signup form with password strength meter + POST /api/auth/signup

const API_BASE = 'http://localhost:3000'; // Change to your EC2 URL in production

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  setTimeout(() => { t.className = ''; }, 3500);
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
  ['emailError', 'passwordError', 'confirmError'].forEach(id => setError(id, ''));
  const fe = document.getElementById('formError');
  if (fe) { fe.textContent = ''; fe.classList.remove('show'); }
}

function setLoading(loading) {
  const btn = document.getElementById('signupBtn');
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

// Password strength checker
function checkPassword(val) {
  const reqs = {
    len:     val.length >= 8,
    upper:   /[A-Z]/.test(val),
    num:     /[0-9]/.test(val),
    special: /[^A-Za-z0-9]/.test(val),
  };

  // Update req indicators
  Object.entries(reqs).forEach(([key, met]) => {
    const el = document.getElementById(`req-${key}`);
    if (!el) return;
    el.classList.toggle('met', met);
    el.querySelector('.req-icon').textContent = met ? '✓' : '○';
  });

  const score = Object.values(reqs).filter(Boolean).length;

  // Bars
  const bars = ['bar1','bar2','bar3','bar4'];
  const barClass = score <= 1 ? 'active-weak' : score <= 2 ? 'active-fair' : score <= 3 ? 'active-fair' : 'active-strong';
  bars.forEach((id, i) => {
    const b = document.getElementById(id);
    b.className = 'strength-bar' + (i < score ? ' ' + barClass : '');
  });

  const label = document.getElementById('strengthLabel');
  if (!val) { label.textContent = ''; return; }
  const levels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', 'var(--red)', 'var(--yellow)', 'var(--yellow)', 'var(--green)'];
  label.textContent = levels[score] || '';
  label.style.color = colors[score] || '';
}

function validateForm() {
  let valid = true;
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm  = document.getElementById('confirm').value;

  if (!email) {
    setError('emailError', 'Email is required'); valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('emailError', 'Enter a valid email address'); valid = false;
  }

  if (!password) {
    setError('passwordError', 'Password is required'); valid = false;
  } else if (password.length < 8) {
    setError('passwordError', 'Password must be at least 8 characters'); valid = false;
  } else if (!/[A-Z]/.test(password)) {
    setError('passwordError', 'Need at least one uppercase letter'); valid = false;
  } else if (!/[0-9]/.test(password)) {
    setError('passwordError', 'Need at least one number'); valid = false;
  }

  if (!confirm) {
    setError('confirmError', 'Please confirm your password'); valid = false;
  } else if (password !== confirm) {
    setError('confirmError', 'Passwords do not match'); valid = false;
  }

  return valid;
}

async function handleSignup() {
  clearErrors();
  if (!validateForm()) return;

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem('cr_token', data.token);
      localStorage.setItem('cr_user', JSON.stringify({ email, id: data.userId }));
      showToast('Account created! Redirecting...', 'success');
      setTimeout(() => { window.location.href = 'editor.html'; }, 900);
    } else {
      const fe = document.getElementById('formError');
      fe.textContent = data.message || 'Signup failed. Please try again.';
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
  if (e.key === 'Enter') handleSignup();
});

// Redirect if already logged in
if (localStorage.getItem('cr_token')) {
  window.location.href = 'editor.html';
}
