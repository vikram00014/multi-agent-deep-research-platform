# Delve — Multi-Agent Deep Research & Synthesis Engine

<p align="center">
  <strong>Autonomous academic literature synthesis, peer-review deliberation, and publication-ready manuscript generation powered by multi-agent architectures.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-blue.svg" alt="Python 3.12" />
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/FastAPI-1.0.0-009688.svg" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Engine-Google%20Gemini%20Free%20Tier-4285f4.svg" alt="Gemini Free Tier" />
  <img src="https://img.shields.io/badge/Database-Supabase%20%2B%20pgvector-3ecf8e.svg" alt="Supabase" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

---

## Overview

**Delve** is an autonomous deep research platform designed to automate the process of academic discovery, cross-paper comparison, critical gap analysis, and manuscript drafting.

Instead of generic summaries, Delve orchestrates a multi-agent deliberation graph that searches peer-reviewed repositories, critiques findings via an iterative **Proposer ↔ Critic** peer review debate, extracts concrete empirical benchmarks, and generates complete, citation-verified academic papers (IEEE, APA, ACM, MLA).

---

## Key Capabilities

- **Autonomous Multi-Source Retrieval:** Queries and cross-references ArXiv, Semantic Scholar, OpenAlex, Crossref, and Tavily Web Search.
- **Iterative Peer-Review Debate:** Employs adversarial Proposer and Critic agents to stress-test claims, challenge methodology weaknesses, and eliminate unsubstantiated assertions.
- **Comprehensive 9-Section Manuscripts:** Assembles complete, 10–20+ page academic publications containing formal mathematical formulations, comparative benchmark matrices, 5-year strategic roadmaps, and complete bibliographies with DOIs.
- **RAG for Custom PDFs:** Upload research papers or internal documents to ground the research in custom datasets using Supabase `pgvector`.
- **Zero-Cost LLM Engine:** Optimized for Google Gemini Free Tier (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemma-4-31b`, `gemini-3.7-flash`) with automatic rate pacing, model cooldown failover, and multi-part token expansion (50,000+ tokens per paper).
- **Export Formats:** Direct Markdown copy and PDF export with IEEE layout typography.

---

## Multi-Agent Architecture

Delve executes an autonomous multi-stage LangGraph execution pipeline:

```
[ Research Planner ]
        │ (Search Queries & Angle Formulation)
        ▼
[ Academic Retrieval ] ───► (ArXiv, Semantic Scholar, OpenAlex, Crossref, Tavily)
        │
        ▼
[ Paper Summarizer ] ───► (Methodologies, Datasets, Limitations & Metrics)
        │
        ▼
[ Synthesis & Debate ] ◄──► [ Proposer ↔ Critic Peer Review Loop ]
        │
        ▼
[ Cross-Paper Analysis ] ───► (Theme Clustering & Consensus/Contradiction Mapping)
        │
        ▼
[ Gap Discovery ] ───► (Unaddressed Frontiers & 5-Year Research Directions)
        │
        ▼
[ Manuscript Architect ] ───► (Full 9-Section Paper + Verified Bibliography)
```

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Python 3.12, FastAPI, LangGraph, Pydantic, HTTPX, ReportLab |
| **LLM Engine** | Google Gemini REST API (Free-Tier Cascade & Cooldown Handler) |
| **Database & Auth** | Supabase (PostgreSQL, Row Level Security, Auth JWT, pgvector, Storage) |
| **Queue & Rate Limits** | Upstash QStash (Durable Background Jobs) & Upstash Redis REST |
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS / CSS Design Tokens, Framer Motion, Lucide Icons |

---

## Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** & `npm`
- **Google Gemini API Key** (Free from [Google AI Studio](https://aistudio.google.com/))
- **Supabase Account** (Free from [Supabase](https://supabase.com/))

---

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/delve.git
cd delve
```

---

### 2. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# On Windows:
.\.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```

Edit `backend/.env` and add your credentials:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_PRIMARY_MODEL=gemini-3.1-flash-lite

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

WS_TICKET_SECRET=generate_a_random_32_char_secret
JOB_DISPATCH_SECRET=generate_a_random_32_char_secret
```

#### Run Database Migrations:
Execute the SQL migration scripts in your Supabase SQL Editor:
1. `backend/supabase/migrations/001_delve_public_beta.sql`
2. `backend/supabase/migrations/002_lifetime_quota.sql`
3. `backend/supabase/migrations/003_increase_paper_quota.sql`

#### Start the Backend Server:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_BASE=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Start the Development Server:

```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in your browser.

---

## Production Deployment

### Backend (Render / Docker)
The backend includes a production-ready `Dockerfile` and `render.yaml` configuration:
1. Connect your GitHub repository to [Render](https://render.com/).
2. Select **Web Service** using the Docker runtime.
3. Configure environment variables (`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `QSTASH_TOKEN`, `UPSTASH_REDIS_REST_URL`, etc.).

### Frontend (Vercel)
The frontend includes a pre-configured `vercel.json` with security headers and SPA rewrites:
1. Import the `frontend/` directory into [Vercel](https://vercel.com/).
2. Add environment variables (`VITE_API_BASE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Deploy.

---

## Security Architecture

- **Row Level Security (RLS):** All user sessions, uploaded documents, vector chunks, and quotas are isolated per user via Supabase RLS (`owner_id = auth.uid()`).
- **Zero Client Secrets:** The Supabase Service Role Key and Gemini API keys are strictly server-side and never exposed to the client.
- **Single-Use WebSocket Tickets:** Authenticates live streaming over WebSockets using short-lived (60s) HMAC tokens instead of transmitting JWTs in query parameters.
- **Hardened HTTP Headers:** Strict CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and restricted CORS policies.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
