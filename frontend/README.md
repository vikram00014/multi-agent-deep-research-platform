# ResearchAgent Frontend — Academic Research Workspace

React 19 single-page application providing an academic research workspace, live agent deliberation feed, and publication manuscript reader.

---

## Features & User Experience

- **Workspace Setup Screen:**
  - Topic entry with pre-populated suggested research prompts.
  - **Research Depth Selector:** Calibrated for Quick (`~3–5 min`), Standard (`~6–8 min`), and Deep (`~10–14 min`) deliberation.
  - **Publication Standard Selector:** IEEE, ACM, APA 7th, and MLA 9th.
  - **Paper Type Selector:** Research Article, Survey / Review, System Paper, Position Paper.
  - **Reference PDF Upload:** Drag-and-drop reference papers to ground research with custom literature.
- **Live Agent Feed:**
  - Real-time streaming of multi-agent debate, evidence extraction, and peer critique via WebSockets with seamless HTTP polling fallback.
  - Clean status indicators and progress timelines without technical jargon.
- **Publication Manuscript Reader (`PaperViewer`):**
  - **Left-Side Section Navigation:** Interactive Table of Contents with real-time **scroll-spy tracking**, a quick **Top** jump button, and an outline collapse toggle for full-width focus reading.
  - **Mobile Outline Drawer:** Responsive slide-over drawer for jumping to sections on smaller devices.
  - **Multi-Format Live Preview:** Instantly switch between IEEE (Two-Column), ACM, APA 7th, and MLA 9th layouts.
  - **KaTeX Equations:** Native rendering of formal mathematical formulations.
  - **Clean Tabular Layouts:** Markdown tables styled for academic clarity.
  - **One-Click Export:** Download publication PDFs or full LaTeX source bundles (`.zip`).
- **Retrieved Sources Dossier:**
  - Search engine breakdown across ArXiv, CrossRef, Semantic Scholar, and PubMed.
  - Verification badges and citation metrics.
- **Analytics & Token Dashboard:**
  - Breakdown of token expenditures, estimated costs, and agent runtimes.
- **Session History Sidebar:**
  - Fast search and resumption of past research papers.

---

## Tech Stack

- **Framework:** React 19, TypeScript, Vite
- **Styling:** CSS Design Tokens, Tailored Academic Layouts (`paper-layout-ieee`, `paper-layout-acm`, etc.)
- **Mathematics & Markdown:** KaTeX, Remark-GFM, Rehype-KaTeX, React Markdown
- **Animations:** Framer Motion (with `prefers-reduced-motion` support)
- **Icons:** Lucide Icons
- **Auth & State:** Supabase JS v2 Client

---

## Setup & Local Run

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_API_BASE=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Start Development Server:
```bash
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

---

## Building for Production

```bash
npm run build
```

The production build generates optimized static bundles into `dist/` with zero TypeScript errors.

---

## Deployment (Vercel)

Configured for zero-config Vercel deployment with `vercel.json` including strict security headers (Content Security Policy, HSTS, X-Frame-Options) and client-side SPA routing rewrites.
