# CodeRunner 🚀

A cloud-based multi-language code execution platform. Write and run Python, Java, and C++ code securely in the browser — each execution sandboxed inside its own Docker container.

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python) ![Java](https://img.shields.io/badge/Java-17-orange?logo=openjdk) ![C++](https://img.shields.io/badge/C++-17-blue?logo=cplusplus) ![Node.js](https://img.shields.io/badge/Node.js-18-green?logo=node.js) ![Docker](https://img.shields.io/badge/Docker-sandboxed-blue?logo=docker) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue?logo=postgresql)

---

## Features

- **Multi-language execution** — Python 3.11, Java 17, C++17
- **Docker sandboxing** — every run is isolated with strict resource limits
- **Result caching** — identical code returns instantly from cache
- **Execution history** — browse, revisit, and delete past submissions
- **JWT authentication** — secure signup/login with bcrypt password hashing
- **Monaco Editor** — the same editor that powers VS Code, in the browser
- **Rate limiting** — per-user execution throttling to prevent abuse

---

## Project Structure

```
coderunner/
├── frontend/
│   ├── home.html               # Landing page
│   ├── login.html              # Login page
│   ├── signup.html             # Signup page
│   ├── editor.html             # IDE (Monaco editor + execution UI)
│   ├── css/
│   │   ├── global.css          # Shared design system + CSS variables
│   │   ├── home.css
│   │   ├── auth.css
│   │   └── editor.css
│   └── js/
│       ├── login.js
│       ├── signup.js
│       └── editor.js
│
├── backend/
│   ├── server.js               # Express entry point
│   ├── package.json
│   ├── .env.example
│   ├── config/
│   │   └── db.js               # PostgreSQL pool + schema bootstrap
│   ├── middleware/
│   │   └── authMiddleware.js   # JWT Bearer token validation
│   ├── routes/
│   │   ├── auth.js             # /api/auth/signup  /api/auth/login
│   │   └── execute.js          # /api/execute  /api/execute/history
│   ├── services/
│   │   ├── dockerService.js    # Docker sandboxed execution engine
│   │   └── hashService.js      # SHA-256 code hashing for cache lookup
│   └── tests/
│       └── api.test.js
│
├── docker-compose.yml          # One-command local dev stack
└── README.md
```

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- [Node.js 18+](https://nodejs.org/)

### 1. Pull execution images (one-time)

```bash
docker pull python:3.11-alpine
docker pull eclipse-temurin:17-jdk-jammy
docker pull gcc:13-bookworm
```

### 2. Start the backend + database

```bash
docker-compose up -d
```

Or run manually:

```bash
cd backend
npm install
cp .env.example .env    # edit DB_PASSWORD and JWT_SECRET
npm run dev
```

### 3. Open the frontend

```bash
npx serve frontend -p 5500
# visit http://localhost:5500
```

Create an account and start running code.

---

## Environment Variables

Copy `backend/.env.example` → `backend/.env`:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `JWT_SECRET` | **Must change** — long random string | — |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `coderunner` |
| `DB_USER` | DB username | `postgres` |
| `DB_PASSWORD` | **Must set** | — |
| `DB_SSL` | Enable SSL (set `true` on AWS RDS) | `false` |
| `DOCKER_MEMORY_LIMIT` | Container RAM cap | `128m` |
| `DOCKER_CPU_LIMIT` | Container CPU cap | `0.5` |
| `DOCKER_TIMEOUT_SECONDS` | Execution kill timeout | `10` |
| `CORS_ORIGIN` | Allowed frontend origin | `*` |

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## API Reference

### Auth — no token required

```
POST /api/auth/signup   { email, password }  →  { token, userId, email }
POST /api/auth/login    { email, password }  →  { token, userId, email }
```

### Execution — requires `Authorization: Bearer <token>`

```
POST   /api/execute              { language, code }       →  { stdout, stderr, status, cached, execMs }
GET    /api/execute/history      ?limit=50&offset=0       →  { submissions: [...] }
DELETE /api/execute/history/:id                           →  { message: "Deleted." }
GET    /health                                            →  { status: "ok" }
```

### Supported Languages

| Key | Runtime | Docker Image |
|---|---|---|
| `python` | Python 3.11 | `python:3.11-alpine` |
| `java` | Java 17 | `eclipse-temurin:17-jdk-jammy` |
| `cpp` | GCC 13 / C++17 | `gcc:13-bookworm` |

---

## Security

Each execution container is launched with:

```
--network=none                   no internet access
--memory=128m                    RAM hard cap
--cpus=0.5                       CPU cap
--pids-limit=32                  prevents fork bombs
--cap-drop=ALL                   all Linux capabilities dropped
--security-opt=no-new-privileges no privilege escalation
```

Auth security: passwords hashed with bcrypt (12 rounds), JWT expiry enforced, generic error messages (no user enumeration), per-user rate limiting on execution.

---

## Running Tests

```bash
cd backend
npm install
npm test
```

Tests mock the database and Docker daemon — no infrastructure required.

---

## AWS Deployment

### EC2 + RDS Setup

```bash
# 1. Launch EC2 (Ubuntu 22.04, t3.medium recommended)
# 2. Create RDS PostgreSQL instance (db.t3.micro, private subnet)
# 3. SSH into EC2 and run:

sudo apt update && sudo apt install -y nodejs npm docker.io
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker ubuntu && newgrp docker

git clone <your-repo> coderunner
cd coderunner/backend
npm install --production
cp .env.example .env
# Set: DB_HOST=<rds-endpoint>, DB_SSL=true, JWT_SECRET, DB_PASSWORD, NODE_ENV=production

docker pull python:3.11-alpine
docker pull eclipse-temurin:17-jdk-jammy
docker pull gcc:13-bookworm

npm install -g pm2
pm2 start server.js --name coderunner
pm2 save && pm2 startup
```

Serve the frontend with nginx on the same instance, or host the `frontend/` folder on S3.

### Security Group Rules

| Type | Port | Source | Purpose |
|---|---|---|---|
| HTTP | 80 | `0.0.0.0/0` | Frontend (nginx) |
| HTTPS | 443 | `0.0.0.0/0` | Frontend (SSL) |
| Custom TCP | 3000 | EC2 security group only | Backend API |
| PostgreSQL | 5432 | EC2 security group only | RDS (never public) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML · CSS · Vanilla JS · Monaco Editor |
| Backend | Node.js · Express |
| Auth | JWT · bcrypt |
| Execution | Docker (Python · Java · C++) |
| Database | PostgreSQL |
| Hosting | AWS EC2 + RDS |
