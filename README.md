# CodeRunner 🚀
### Cloud-Based Multi-Language Code Execution Platform

Run Python, Java, and C++ code securely in the browser — backed by Docker containers on AWS.

---

## Project Structure

```
coderunner/
├── frontend/                   ← Static web UI (no build step needed)
│   ├── home.html               ← Landing page
│   ├── login.html              ← Login page
│   ├── signup.html             ← Signup page
│   ├── editor.html             ← IDE editor (Monaco + execution UI)
│   ├── css/
│   │   ├── global.css          ← Shared design system + variables
│   │   ├── home.css            ← Landing page styles
│   │   ├── auth.css            ← Login / signup styles
│   │   └── editor.css          ← IDE layout styles
│   └── js/
│       ├── login.js            ← Login form + API call
│       ├── signup.js           ← Signup form + password strength meter
│       └── editor.js           ← Monaco init, execution, history, resize
│
├── backend/                    ← Node.js + Express API
│   ├── server.js               ← Entry point, middleware, routes
│   ├── package.json
│   ├── .env.example            ← Copy to .env and configure
│   ├── config/
│   │   └── db.js               ← PostgreSQL pool + schema bootstrap
│   ├── middleware/
│   │   └── authMiddleware.js   ← JWT Bearer token validation
│   ├── routes/
│   │   ├── auth.js             ← POST /api/auth/signup  /login
│   │   └── execute.js          ← POST /api/execute  GET /api/history
│   ├── services/
│   │   ├── dockerService.js    ← Sandboxed Docker execution engine
│   │   └── hashService.js      ← SHA-256 hashing for cache lookup
│   └── tests/
│       └── api.test.js         ← Jest unit + integration tests
│
├── docker-compose.yml          ← One-command local dev environment
└── README.md                   ← This file
```

---

## Quick Start (Local Dev — 3 steps)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running
- [Node.js 18+](https://nodejs.org/)

### 1. Pull execution images (one-time)
```bash
docker pull python:3.11-alpine
docker pull openjdk:17-alpine
docker pull gcc:13-bookworm
```

### 2. Start backend + database
```bash
docker-compose up -d          # starts postgres + backend
```

Or manually:
```bash
cd backend
npm install
cp .env.example .env          # edit DB_PASSWORD and JWT_SECRET
npm run dev
```

### 3. Open the frontend
Open `frontend/home.html` in your browser — or serve with:
```bash
npx serve frontend -p 5500
# then visit http://localhost:5500
```

That's it. Visit `http://localhost:5500`, create an account, and run code.

---

## Environment Variables

Copy `backend/.env.example` → `backend/.env` and set:

| Variable | Description | Default |
|----------|-------------|---------|
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
| `DOCKER_TIMEOUT_SECONDS` | Kill timeout | `10` |
| `CORS_ORIGIN` | Frontend URL | `*` |

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## API Reference

### Auth (no token required)
```
POST /api/auth/signup   { email, password }  →  { token, userId, email }
POST /api/auth/login    { email, password }  →  { token, userId, email }
```

### Execution (requires Authorization: Bearer <token>)
```
POST   /api/execute          { language, code }        →  { stdout, stderr, status, cached, execMs }
GET    /api/history           ?limit=50&offset=0        →  { submissions: [...] }
DELETE /api/history/:id                                 →  { message: "Deleted." }
GET    /health                                          →  { status: "ok" }
```

### Supported languages
| Key | Runtime | Docker Image |
|-----|---------|-------------|
| `python` | Python 3.11 | `python:3.11-alpine` |
| `java` | Java 17 | `openjdk:17-alpine` |
| `cpp` | GCC 13 / C++17 | `gcc:13-bookworm` |

---

## Security Architecture

Every code execution is sandboxed with:
```
--network=none          no internet access
--memory=128m           RAM hard cap
--memory-swap=128m      swap disabled
--cpus=0.5              CPU cap
--pids-limit=32         no fork bombs
--read-only             read-only root filesystem
--cap-drop=ALL          all Linux capabilities dropped
--security-opt=no-new-privileges
-u 65534                runs as nobody (non-root)
--tmpfs /tmp:size=32m   only /tmp is writable
```

Auth security:
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens with configurable expiry
- Generic error messages (no user enumeration)
- Per-user execution rate limiting

---

## Running Tests

```bash
cd backend
npm install
npm test
```

Tests mock the DB and Docker — no infrastructure needed.

---

## AWS Deployment

### EC2 + RDS Setup

```bash
# 1. Launch EC2 (Ubuntu 22.04, t3.medium recommended)
# 2. Create RDS PostgreSQL (db.t3.micro, private subnet)
# 3. SSH into EC2

# Install dependencies
sudo apt update && sudo apt install -y nodejs npm docker.io
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker ubuntu
newgrp docker

# Clone and configure
git clone <your-repo> coderunner
cd coderunner/backend
npm install --production
cp .env.example .env
nano .env   # set DB_HOST=<rds-endpoint>, JWT_SECRET, DB_PASSWORD, NODE_ENV=production, DB_SSL=true

# Pull Docker execution images
docker pull python:3.11-alpine
docker pull openjdk:17-alpine
docker pull gcc:13-bookworm

# Run with PM2
npm install -g pm2
pm2 start server.js --name coderunner
pm2 save && pm2 startup

# Host frontend (S3 or nginx)
# Option A — nginx on same EC2:
sudo apt install -y nginx
sudo cp -r ../frontend/* /var/www/html/
sudo systemctl restart nginx
```

### Security Group Rules

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| HTTP | 80 | 0.0.0.0/0 | Frontend (nginx) |
| HTTPS | 443 | 0.0.0.0/0 | Frontend (SSL) |
| Custom TCP | 3000 | EC2 SG only | Backend API |
| PostgreSQL | 5432 | EC2 SG only | RDS (never public) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML · CSS · Vanilla JS · Monaco Editor |
| Backend | Node.js · Express.js |
| Auth | JWT · bcrypt |
| Execution | Docker (Python · Java · C++) |
| Database | PostgreSQL (AWS RDS) |
| Hosting | AWS EC2 + RDS (+ optional S3) |
