# ResearchAgent — Autonomous Academic Deep Research Platform

<p align="center">
  <strong>Autonomous academic literature synthesis, peer-review deliberation, and publication-ready manuscript generation powered by multi-agent architectures.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11%20%7C%203.12-blue.svg" alt="Python" />
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React 19" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688.svg" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Compiler-Typst%200.15-239dad.svg" alt="Typst 0.15" />
  <img src="https://img.shields.io/badge/Engine-Google%20Gemini%20Free%20Tier-4285f4.svg" alt="Gemini Free Tier" />
  <img src="https://img.shields.io/badge/Database-Supabase%20%2B%20pgvector-3ecf8e.svg" alt="Supabase" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

---

## Overview

**ResearchAgent** is an autonomous deep research platform that automates academic discovery, cross-paper comparison, critical research gap discovery, and publication-grade manuscript typesetting.

Instead of shallow summaries, ResearchAgent orchestrates a multi-agent deliberation graph that:
1. Searches authoritative academic repositories (ArXiv, CrossRef, Semantic Scholar, OpenAlex, PubMed, Tavily).
2. Performs deep cross-paper synthesis and extracts empirical benchmark data.
3. Conducts an iterative adversarial **Proposer ↔ Critic** peer review debate to stress-test claims and eliminate unsubstantiated assertions.
4. Drafts a rigorous, comprehensive 9-section publication manuscript (3,000–5,000+ words) with formal mathematics and empirical data matrices.
5. Formats and compiles the output using **Typst 0.15** into publication-grade PDFs conforming to official **IEEE**, **ACM**, **APA 7th**, or **MLA 9th** standards, with complete LaTeX `.zip` source bundles.

---

## Key Capabilities

- **Autonomous Multi-Source Retrieval:** Asynchronously queries ArXiv, Semantic Scholar, CrossRef, OpenAlex, PubMed, and Tavily Web Search.
- **Iterative Peer Review Debate:** Adversarial Proposer and Critic agents rigorously challenge methodology weaknesses and check citation integrity.
- **Multi-Standard Academic Typesetting:**
  - **IEEE:** Two-column conference grid, Roman section numbering, IEEEtran geometry, IEEE CSL reference style.
  - **ACM:** Two-column Sigconf proceedings format, CCS Concepts, ACM CSL reference style.
  - **APA 7th:** Single-column professional manuscript format with running head and Author-Date citations.
  - **MLA 9th:** Single-column academic format with double-spaced typography and Works Cited.
- **LaTeX Archive Export:** Generates complete `.zip` archives containing `.tex` manuscript source, `.bib` BibTeX databases, and figures for Overleaf or direct submission.
- **Interactive Reader UI:**
  - **Left-Side Section Outline:** Interactive Table of Contents with real-time scroll-spy tracking, quick **Top** jump, and collapsible focus mode.
  - **Live Format Switcher:** Preview manuscripts instantly in IEEE, ACM, APA, or MLA layouts.
  - **KaTeX Mathematical Typesetting:** Live rendering of formulas and equations.
  - **Clean Data Tables:** Clean, responsive tabular layouts.
- **Dual-Workhorse Free-Tier LLM Architecture:**
  - Intelligently balances traffic between `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite`.
  - Sliding-window 60-second rate-pacing ensures usage stays safely below the 15 RPM limit while providing **30–45 RPM** and **1,000+ requests per day** with zero rate-limit errors.
  - 1,048,576 token context window prevents any context overflow or prompt truncation.
- **RAG for Custom PDFs:** Ground research in user-uploaded PDFs using Supabase `pgvector` and 384-dimensional semantic embeddings.
- **Real-Time Streaming:** Live agent deliberation feed over WebSockets with automatic HTTP polling fallback.

---

## Multi-Agent Architecture

```
[ Research Planner ]
        │ (Formulates queries, angles, constraints & paper type)
        ▼
[ Parallel Retrieval ] ───► (ArXiv, Semantic Scholar, Crossref, PubMed, Tavily)
        │
        ▼
[ Paper Summarizer ] ───► (Extracts methodology, datasets, limitations, metrics)
        │
        ▼
[ Synthesis & Debate ] ◄──► [ Proposer ↔ Critic Adversarial Peer Review ]
        │
        ▼
[ Cross-Paper Analysis ] ───► (Consensus mapping & contradiction discovery)
        │
        ▼
[ Gap Discovery ] ───► (5-Year Strategic Roadmap & Open Research Frontiers)
        │
        ▼
[ Manuscript Architect ] ───► (Drafts 9-Section Paper in Part A + Part B)
        │
        ▼
[ Citation QA & Preflight ] ──► (Validates reference markers, DOIs & bibliography)
        │
        ▼
[ Typst 0.15 Compiler ] ────► (Generates publication PDF: IEEE / ACM / APA / MLA)
```

---

## Research Configurations

| Depth Mode | Papers Analyzed | Deliberation Rounds | Estimated Run Time | Best For |
| :--- | :---: | :---: | :---: | :--- |
| **Quick Synthesis** | 8–10 papers | 0 debate rounds | **~3–5 min** | Fast literature overviews and initial exploratory queries |
| **Standard Review** | 12–15 papers | 1 debate round | **~6–8 min** | Rigorous state-of-the-art surveys with peer critique |
| **Deep Deliberation** | 15–20 papers | 2 debate rounds | **~10–14 min** | Publication-grade manuscripts with extensive adversarial review |

**Supported Paper Types:**
- Research Article (Experimental)
- Survey / Review
- System Paper
- Position Paper

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Backend** | Python 3.11+, FastAPI, Uvicorn, LangGraph, Pydantic v2, HTTPX |
| **Typesetting & Export** | Typst 0.15, ReportLab (fallback), KaTeX, BibTeX, Zipfile |
| **LLM Engine** | Google Gemini Free-Tier (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-flash-lite-latest`) |
| **Database & Auth** | Supabase (PostgreSQL, Row Level Security, Auth JWKS, pgvector, Storage) |
| **Retrieval APIs** | ArXiv, CrossRef, Semantic Scholar, OpenAlex, PubMed, Tavily Search |
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS / CSS Design Tokens, Framer Motion, Lucide Icons |

---

## Getting Started

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** & `npm`
- **Google Gemini API Key** (Free from [Google AI Studio](https://aistudio.google.com/))
- **Supabase Project** (Free from [Supabase](https://supabase.com/))
- **Tavily Search API Key** (Free from [Tavily](https://tavily.com/))

---

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\activate   # Windows
# source .venv/bin/activate # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

Edit `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_PRIMARY_MODEL=gemini-3.1-flash-lite
TAVILY_API_KEY=your_tavily_api_key_here

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=delve-documents

WS_TICKET_SECRET=your_random_32_char_secret_here
```

#### Run Database Migrations:
Execute these SQL scripts in order in your Supabase SQL Editor:
1. `backend/supabase/migrations/001_delve_public_beta.sql`
2. `backend/supabase/migrations/002_lifetime_quota.sql`
3. `backend/supabase/migrations/003_increase_paper_quota.sql`
4. `backend/supabase/migrations/004_unlimited_quota.sql`

#### Start Backend Server:
```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

---

### 2. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_BASE=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

#### Start Frontend Server:
```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in your browser.

---

### 3. Verify Operational Health

You can run automated pre-flight diagnostics at any time:

```bash
cd backend

# Test Tavily, Gemini LLM, and Supabase database & storage
python scratch/test_all_services.py

# Test all 4 publication PDF outputs (IEEE, ACM, APA, MLA)
python test_generate_four_papers.py
```

---

## Production Deployment

### Backend (Render / Docker)
The backend includes a production-ready `Dockerfile` and `render.yaml`:
1. Connect your GitHub repository to [Render](https://render.com/).
2. Select **Web Service** with the Docker runtime.
3. Configure environment variables (`GEMINI_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WS_TICKET_SECRET`).

### Frontend (Vercel)
The frontend includes a pre-configured `vercel.json` with security headers and SPA rewrites:
1. Import the `frontend/` directory into [Vercel](https://vercel.com/).
2. Add environment variables (`VITE_API_BASE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Deploy.

---

## Security Architecture

- **Row-Level Security (RLS):** All user sessions, uploaded documents, vector chunks, and quotas are isolated per user (`owner_id = auth.uid()`).
- **Zero Client-Exposed Secrets:** Gemini API keys and Supabase Service Role keys remain strictly server-side.
- **Single-Use WebSocket Tickets:** Authenticates live streaming using short-lived (60s) HMAC tokens rather than passing JWTs in WebSocket URLs.
- **Cryptographic JWT Verification:** Backend validates user tokens via Supabase asymmetric JWKS keys.
- **Hardened HTTP Headers:** Content Security Policy, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
