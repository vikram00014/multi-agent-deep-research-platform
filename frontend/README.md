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
  - **Ergonomic Digital Reading Lane:** High-readability single-column academic reader (`max-w-[820px] mx-auto`) engineered for continuous scrolling without the disjointed column breaks and table clipping typical of browser CSS multi-column layouts.
  - **Left-Side Section Navigation:** Interactive Table of Contents with real-time **scroll-spy tracking**, a quick **Top** jump button, and an outline collapse toggle for full-width focus reading.
  - **Mobile Outline Drawer:** Responsive slide-over drawer for jumping to sections on smaller mobile and tablet viewports.
  - **Multi-Standard Style Previews:** Switch between IEEE, ACM, APA 7th, and MLA 9th typography and citation conventions.
  - **Camera-Ready PDF & LaTeX Export:** One-click download of authentic Typst-compiled PDFs (with balanced 2-column layouts for IEEE and ACM) and complete LaTeX `.zip` bundles with `.bib` databases for Overleaf.
  - **KaTeX Equations & Data Tables:** Flawlessly rendered LaTeX math equations and responsive academic comparison matrices.
- **Interactive Chat with Paper:**
  - Conversational Q&A interface grounded directly in the synthesized manuscript and retrieved citations.
- **Academic Presentation Slides:**
  - Instant slide deck generation summarizing key research contributions, methodology, and future roadmaps.
- **Retrieved Sources Dossier:**
  - Search engine breakdown across ArXiv, CrossRef, Semantic Scholar, and PubMed with verification badges and citation metrics.
- **Analytics & Token Dashboard:**
  - Breakdown of token expenditures, estimated costs, and agent runtimes.
- **Session History Sidebar:**
  - Fast search and resumption of past research papers with delete and retry controls.

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
- Repository: `https://github.com/designnest411-stack/Delve_f.git`
- Environment Variables: `VITE_API_BASE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
