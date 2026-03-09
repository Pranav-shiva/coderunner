// services/dockerService.js
// Pipes code via stdin — zero volume mounts, zero Windows path issues.
// Strategy per language:
//   Python: echo code | docker run python -c "exec(input())"  — NO, unreliable
//   Better: pipe a tar stream into the container via docker run --rm -i,
//   but simplest of all: write code to a temp file, then use docker cp approach
//   with spawnSync (confirmed working), fixing the 500 by making create/cp sync
//   and only start async.

const { spawnSync, spawn, execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const WORKSPACE = path.join(__dirname, '..', 'workspace');

const IMAGES = {
  python: 'python:3.11-alpine',
  java:   'eclipse-temurin:17-jdk-jammy',
  cpp:    'gcc:13-bookworm',
};

const FILES = {
  python: 'main.py',
  java:   'Main.java',
  cpp:    'main.cpp',
};

function buildCommand(lang) {
  if (lang === 'python') return 'python main.py';
  if (lang === 'java')   return 'javac Main.java && java Main';
  if (lang === 'cpp')    return 'g++ main.cpp -o main && ./main';
}

async function runInDocker(language, code) {
  const memoryLimit    = process.env.DOCKER_MEMORY_LIMIT     || '128m';
  const cpuLimit       = process.env.DOCKER_CPU_LIMIT        || '0.5';
  const pidsLimit      = process.env.DOCKER_PIDS_LIMIT       || '32';
  const timeoutSeconds = parseInt(process.env.DOCKER_TIMEOUT_SECONDS || '15', 10);

  const id      = uuidv4();
  const jobDir  = path.join(WORKSPACE, id);
  const srcFile = FILES[language];
  const srcPath = path.join(jobDir, srcFile);

  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(srcPath, code, 'utf8');

  let containerId = null;

  function cleanup() {
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch (_) {}
    if (containerId) {
      try { spawnSync('docker', ['rm', '-f', containerId]); } catch (_) {}
    }
  }

  // ── Step 1: docker create (sync) ──────────────────────────────────────────
  const createResult = spawnSync('docker', [
    'create',
    '--network=none',
    `--memory=${memoryLimit}`,
    `--cpus=${cpuLimit}`,
    `--pids-limit=${pidsLimit}`,
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '-w', '/code',
    IMAGES[language],
    'sh', '-c', buildCommand(language),
  ], { encoding: 'utf8', timeout: 30000 });

  if (createResult.status !== 0 || !createResult.stdout.trim()) {
    cleanup();
    return {
      stdout: '',
      stderr: `Container create failed: ${(createResult.stderr || '').trim()}`,
      exitCode: 1,
      execMs: 0,
    };
  }

  containerId = createResult.stdout.trim();
  console.log(`[docker] created ${containerId.slice(0,12)} lang=${language}`);

  // ── Step 2: docker cp (sync) ──────────────────────────────────────────────
  const cpResult = spawnSync('docker', [
    'cp', srcPath, `${containerId}:/code/${srcFile}`,
  ], { encoding: 'utf8', timeout: 10000 });

  if (cpResult.status !== 0) {
    cleanup();
    return {
      stdout: '',
      stderr: `File copy failed: ${(cpResult.stderr || '').trim()}`,
      exitCode: 1,
      execMs: 0,
    };
  }

  console.log(`[docker] copied ${srcFile} into container`);

  // ── Step 3: docker start -a (async, streaming) ────────────────────────────
  const startTime = Date.now();

  return new Promise((resolve) => {
    // -a attaches stdout+stderr, combined into one stream by Docker
    // Use --attach STDOUT --attach STDERR for separation
    const proc = spawn('docker', [
      'start',
      '--attach', '--interactive=false',
      containerId,
    ]);

    let stdout = '';
    let stderr = '';
    let settled = false;

    function finish(exitCode) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const execMs = Date.now() - startTime;
      cleanup();
      console.log(`[docker] done exitCode=${exitCode} execMs=${execMs} stdout=${stdout.length}b`);
      resolve({ stdout, stderr, exitCode: exitCode ?? 1, execMs });
    }

    const timer = setTimeout(() => {
      try { spawnSync('docker', ['stop', containerId]); } catch (_) {}
      stderr += `\n[Timed out after ${timeoutSeconds}s]`;
      finish(1);
    }, timeoutSeconds * 1000);

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close',  (code) => finish(code));
    proc.on('error',  (err)  => {
      stderr += `Spawn error: ${err.message}`;
      finish(1);
    });
  });
}

module.exports = { runInDocker };
