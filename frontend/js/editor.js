// ── editor.js ──
// Monaco Editor + Code Execution + History + Resize

const API_BASE = 'http://localhost:3000'; // Change to your EC2 URL in production

// ── Auth guard ──
const token = localStorage.getItem('cr_token');
const userRaw = localStorage.getItem('cr_user');
if (!token) { window.location.href = 'login.html'; }

const user = userRaw ? JSON.parse(userRaw) : {};
document.getElementById('userEmail').textContent = user.email || 'User';

function logout() {
  localStorage.removeItem('cr_token');
  localStorage.removeItem('cr_user');
  window.location.href = 'login.html';
}

// ── Language config ──
const LANGS = {
  python: {
    label:   'Python 3',
    file:    'main.py',
    monaco:  'python',
    snippet: `# CodeRunner — Python 3\nprint("Hello from CodeRunner!")\n\nfor i in range(5):\n    print(f"  Line {i+1}")\n`,
  },
  java: {
    label:   'Java 17',
    file:    'Main.java',
    monaco:  'java',
    snippet: `// CodeRunner — Java 17\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from CodeRunner!");\n        for (int i = 1; i <= 5; i++) {\n            System.out.println("  Line " + i);\n        }\n    }\n}\n`,
  },
  cpp: {
    label:   'C++17',
    file:    'main.cpp',
    monaco:  'cpp',
    snippet: `// CodeRunner — C++17\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello from CodeRunner!" << endl;\n    for (int i = 1; i <= 5; i++) {\n        cout << "  Line " << i << endl;\n    }\n    return 0;\n}\n`,
  },
};

let currentLang = 'python';
let editor = null;

// Store per-language code so switching tabs preserves edits
const codeCache = {
  python: LANGS.python.snippet,
  java:   LANGS.java.snippet,
  cpp:    LANGS.cpp.snippet,
};

// Rate limiting (client-side guard: max 5 runs / 30s)
const RATE_LIMIT  = 5;
const RATE_WINDOW = 30000;
let recentRuns = [];

function isRateLimited() {
  const now = Date.now();
  recentRuns = recentRuns.filter(t => now - t < RATE_WINDOW);
  return recentRuns.length >= RATE_LIMIT;
}

function recordRun() {
  recentRuns.push(Date.now());
}

// ── Monaco init ──
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
  // Custom dark theme
  monaco.editor.defineTheme('coderunner-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment',    foreground: '4a5568', fontStyle: 'italic' },
      { token: 'keyword',    foreground: 'ff79c6' },
      { token: 'string',     foreground: 'f1fa8c' },
      { token: 'number',     foreground: 'bd93f9' },
      { token: 'identifier', foreground: 'c9d8e8' },
      { token: 'type',       foreground: '8be9fd' },
      { token: 'function',   foreground: '50fa7b' },
    ],
    colors: {
      'editor.background':              '#080b0f',
      'editor.foreground':              '#c9d8e8',
      'editor.lineHighlightBackground': '#0d1117',
      'editor.selectionBackground':     '#00d4ff22',
      'editorLineNumber.foreground':    '#2d3d4f',
      'editorLineNumber.activeForeground': '#5a7080',
      'editorGutter.background':        '#080b0f',
      'editorCursor.foreground':        '#00d4ff',
      'editor.findMatchBackground':     '#ffd32a33',
      'editorBracketMatch.background':  '#00d4ff11',
      'editorBracketMatch.border':      '#00d4ff',
      'scrollbarSlider.background':     '#1e2a3866',
      'scrollbarSlider.hoverBackground':'#243040aa',
    },
  });

  editor = monaco.editor.create(document.getElementById('monacoEditor'), {
    value:                   codeCache[currentLang],
    language:                LANGS[currentLang].monaco,
    theme:                   'coderunner-dark',
    fontSize:                14,
    fontFamily:              "'JetBrains Mono', monospace",
    fontLigatures:           true,
    lineNumbers:             'on',
    minimap:                 { enabled: true, scale: 1 },
    scrollBeyondLastLine:    false,
    automaticLayout:         true,
    tabSize:                 4,
    insertSpaces:            true,
    wordWrap:                'off',
    renderLineHighlight:     'all',
    bracketPairColorization: { enabled: true },
    padding:                 { top: 16, bottom: 16 },
    smoothScrolling:         true,
    cursorBlinking:          'phase',
    cursorSmoothCaretAnimation: 'on',
  });

  // Track cursor position in status bar
  editor.onDidChangeCursorPosition(e => {
    document.getElementById('statusLines').textContent =
      `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });

  // Ctrl+Enter / Cmd+Enter to run
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCode);

  // Cache code on change
  editor.onDidChangeModelContent(() => {
    codeCache[currentLang] = editor.getValue();
  });

  // Load initial history
  loadHistory();
});

// ── Language switching ──
function switchLang(lang, btn) {
  if (lang === currentLang) return;

  // Save current code before switching
  if (editor) codeCache[currentLang] = editor.getValue();

  currentLang = lang;

  // Update active tab
  document.querySelectorAll('.lang-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Update Monaco model
  if (editor) {
    const model = monaco.editor.createModel(codeCache[lang], LANGS[lang].monaco);
    editor.setModel(model);
    editor.focus();
  }

  // Update UI
  document.getElementById('topbarFile').textContent          = LANGS[lang].file;
  document.getElementById('statusLang').textContent          = LANGS[lang].label;
  document.getElementById('statusCached').style.display      = 'none';

  clearOutput();
}

// ── Run code ──
async function runCode() {
  if (!editor) return;

  // Client-side rate limit check
  if (isRateLimited()) {
    document.getElementById('rateWarning').classList.add('show');
    setTimeout(() => document.getElementById('rateWarning').classList.remove('show'), 5000);
    return;
  }

  const code = editor.getValue().trim();
  if (!code) {
    showToast('Write some code first!', '');
    return;
  }

  // UI: loading state
  const runBtn  = document.getElementById('runBtn');
  const runText = document.getElementById('runBtnText');
  runBtn.disabled = true;
  runText.textContent = '⟳';
  runBtn.querySelector('svg').style.display = 'none';
  setOutputState('running', '● RUNNING...');

  const outputContent = document.getElementById('outputContent');
  outputContent.innerHTML = `<span style="color:var(--text-dim);font-family:var(--mono);font-size:12px">Spinning up Docker container...</span>`;

  const startTime = Date.now();

  try {
    const res = await fetch(`${API_BASE}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ language: currentLang, code }),
    });

    const data = await res.json();

    if (res.status === 401) { logout(); return; }

    if (res.status === 429) {
      document.getElementById('rateWarning').classList.add('show');
      setTimeout(() => document.getElementById('rateWarning').classList.remove('show'), 5000);
      setOutputState('error', '● RATE LIMITED');
      outputContent.innerHTML = `<span class="output-stderr">Rate limit exceeded. Please wait before running again.</span>`;
      return;
    }

    const elapsed = Date.now() - startTime;
    recordRun();

    if (res.ok) {
      renderOutput(data, elapsed);
      loadHistory(); // Refresh sidebar
    } else {
      setOutputState('error', '● ERROR');
      outputContent.innerHTML = `<span class="output-stderr">${escHtml(data.message || 'Execution failed.')}</span>`;
    }

  } catch (err) {
    setOutputState('error', '● CONNECTION ERROR');
    outputContent.innerHTML = `<span class="output-stderr">Cannot reach server.\nMake sure backend is running at ${API_BASE}</span>`;
  } finally {
    runBtn.disabled = false;
    runText.textContent = 'RUN';
    runBtn.querySelector('svg').style.display = '';
  }
}

function renderOutput(data, elapsed) {
  const outputContent = document.getElementById('outputContent');
  const cached = data.cached || false;

  // Show/hide cached badge
  const cachedEl = document.getElementById('statusCached');
  cachedEl.style.display = cached ? 'inline' : 'none';

  if (data.stderr && data.stderr.trim()) {
    setOutputState('error', '● ERROR');
  } else {
    setOutputState('success', '● SUCCESS');
  }

  let html = '';

  if (data.stdout && data.stdout.trim()) {
    html += `<div class="output-stdout">${escHtml(data.stdout)}</div>`;
  }

  if (data.stderr && data.stderr.trim()) {
    html += `<div class="output-stderr">${escHtml(data.stderr)}</div>`;
  }

  if (!data.stdout?.trim() && !data.stderr?.trim()) {
    html += `<span style="color:var(--text-dim);font-style:italic;font-size:12px">Program produced no output.</span>`;
  }

  html += `<div class="output-meta">
    <span>⏱ ${elapsed}ms</span>
    ${cached
      ? '<span style="color:var(--green)">⚡ Cached result</span>'
      : '<span>🐳 Executed in Docker</span>'}
    <span>${LANGS[currentLang].label}</span>
  </div>`;

  outputContent.innerHTML = html;

  // Update line count in status bar
  const lines = (data.stdout || '').split('\n').filter(Boolean).length;
  document.getElementById('outputStats').textContent = `${lines} lines`;
}

function setOutputState(state, label) {
  const el = document.getElementById('outputIndicator');
  el.className = 'output-indicator';
  el.classList.add({
    idle:    'ind-idle',
    running: 'ind-running',
    success: 'ind-success',
    error:   'ind-error',
  }[state] || 'ind-idle');
  el.textContent = label;
}

function clearOutput() {
  document.getElementById('outputContent').innerHTML =
    '<span class="output-placeholder">Press RUN to execute your code...</span>';
  document.getElementById('outputStats').textContent = '';
  document.getElementById('statusCached').style.display = 'none';
  setOutputState('idle', '● IDLE');
}

// ── History ──
async function loadHistory() {
  const list = document.getElementById('historyList');
  try {
    // FIX: URL was /api/history — wrong. Routes are mounted at /api/execute,
    // so the history sub-route resolves to /api/execute/history.
    const res = await fetch(`${API_BASE}/api/execute/history`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    renderHistory(data.submissions || []);
  } catch {
    list.innerHTML = `<div class="history-empty">Could not load history.<br>Check server connection.</div>`;
  }
}

function renderHistory(submissions) {
  const list = document.getElementById('historyList');
  if (!submissions.length) {
    list.innerHTML = `<div class="history-empty">No executions yet.<br>Run some code to see history here.</div>`;
    return;
  }

  list.innerHTML = submissions.slice(0, 50).map((s, i) => {
    const lang    = s.language || 'python';
    const status  = s.status === 'error' ? 'status-err' : 'status-ok';
    const icon    = s.status === 'error' ? '✕' : '✓';
    const preview = (s.code || '').split('\n')[0].slice(0, 36) || '—';
    const time    = formatTime(s.created_at);

    return `<div class="history-item" onclick="loadHistoryItem(${i})" data-idx="${i}" data-code="${escAttr(s.code)}" data-lang="${lang}">
      <div class="history-item-top">
        <span class="history-lang lang-${lang}">${lang}</span>
        <span class="history-status ${status}">${icon}</span>
      </div>
      <div class="history-preview">${escHtml(preview)}</div>
      <div class="history-time">${time}</div>
    </div>`;
  }).join('');
}

function loadHistoryItem(idx) {
  const item = document.querySelector(`[data-idx="${idx}"]`);
  if (!item) return;
  const lang = item.dataset.lang;
  const code = item.dataset.code;

  // Switch language tab if needed
  if (lang !== currentLang) {
    const tab = document.querySelector(`[data-lang="${lang}"]`);
    if (tab) switchLang(lang, tab);
  }

  // Load code into editor
  if (editor) {
    editor.setValue(code);
    editor.focus();
  }

  // Mark active
  document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
  item.classList.add('active');

  showToast('Code loaded from history', '');
}

// ── Resize output panel ──
(function initResize() {
  const handle = document.getElementById('resizeHandle');
  const panel  = document.getElementById('outputPanel');
  let dragging = false;
  let startY, startH;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startY   = e.clientY;
    startH   = panel.offsetHeight;
    document.body.style.userSelect = 'none';
    document.body.style.cursor     = 'row-resize';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = startY - e.clientY;
    const newH  = Math.max(80, Math.min(startH + delta, window.innerHeight * 0.7));
    panel.style.height = newH + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor     = '';
    if (editor) editor.layout();
  });
})();

// ── Toast ──
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + (type || '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 3000);
}

// ── Helpers ──
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(str) {
  return String(str || '')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '&#10;');
}

function formatTime(ts) {
  if (!ts) return '';
  const d    = new Date(ts);
  const now  = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}
