import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Brain, FileText, FlaskConical, GitBranch, Layers, Search, ShieldCheck, Sparkles, Zap } from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
}

const PIPELINE_NODES = [
  { icon: Brain,        label: '01 — Research Planner',    color: '#6366f1', desc: 'Refines research questions, queries & retrieval strategy' },
  { icon: Search,       label: '02 — Academic Retrieval',  color: '#818cf8', desc: 'Searches academic indexes, repositories & research sources' },
  { icon: BookOpen,     label: '03 — Paper Summarizer',    color: '#9333ea', desc: 'Extracts methodology, datasets, findings & limitations' },
  { icon: Layers,       label: '04 — Literature Proposer', color: '#c026d3', desc: 'Synthesizes evidence into a structured literature review' },
  { icon: FlaskConical, label: '05 — Peer Review Critic',  color: '#ec4899', desc: 'Challenges claims, evidence & methodological assumptions' },
  { icon: GitBranch,    label: '06 — Cross-Paper Analyst', color: '#f43f5e', desc: 'Maps themes, contradictions, evidence & research trends' },
  { icon: Sparkles,     label: '07 — Gap Discovery',       color: '#f59e0b', desc: 'Identifies evidence-backed research gaps & future directions' },
  { icon: Zap,          label: '08 — Paper Architect',     color: '#10b981', desc: 'Structures research into IEEE/APA manuscript drafts' },
];

const STATS = [
  { value: '8', label: 'Autonomous Agents' },
  { value: '6', label: 'Research Sources' },
  { value: 'Automated', label: 'Citation Verification' },
  { value: '5 Free', label: 'Research Papers' },
];

const FEATURES = [
  {
    icon: Search,
    title: 'Multi-Source Retrieval',
    desc: 'Live academic search across ArXiv, Semantic Scholar, OpenAlex, Crossref, GitHub, and Tavily.',
  },
  {
    icon: FlaskConical,
    title: 'Proposer–Critic Debate',
    desc: 'Competing agents challenge claims, identify weaknesses, and refine the research synthesis through iterative debate.',
  },
  {
    icon: ShieldCheck,
    title: 'Automated Citation Verification',
    desc: 'Validates DOIs, publication metadata, and evidence grounding to reduce citation errors and unsupported claims.',
  },
  {
    icon: Sparkles,
    title: 'Research Gap Analysis',
    desc: 'Discovers unexplored research opportunities with structured evidence mapping and innovation roadmaps.',
  },
  {
    icon: Zap,
    title: 'Live Research Stream',
    desc: 'Watch agents search, critique, debate, and synthesize findings in real time as the pipeline executes.',
  },
  {
    icon: FileText,
    title: 'Custom PDF Grounding',
    desc: 'Upload reference PDFs to index private papers into pgvector embeddings for domain-specific RAG synthesis.',
  },
];

export function LandingPage({ onSignIn }: LandingPageProps) {
  return (
    <div
      className="landing-scroll"
      style={{ background: 'var(--gradient-hero)' }}
    >
      {/* ── Background orbs ── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        <div
          className="absolute rounded-full opacity-25 float"
          style={{
            width: 600, height: 600,
            top: -200, left: -100,
            background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute rounded-full opacity-20 float float-delay-2"
          style={{
            width: 500, height: 500,
            bottom: -100, right: -100,
            background: 'radial-gradient(circle, rgba(236,72,153,0.25) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
        {/* ── Navigation ── */}
        <nav className="flex items-center justify-between px-4 sm:px-8 py-6 max-w-6xl mx-auto safe-top">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Brain size={18} color="white" />
            </div>
            <span className="font-bold text-lg tracking-tight" style={{ color: 'var(--color-ink)' }}>Delve</span>
          </div>
          <button
            onClick={onSignIn}
            className="control-button control-button-primary text-xs font-semibold"
            style={{ padding: '0.5rem 1.25rem', borderRadius: 999 }}
          >
            Sign In <ArrowRight size={14} />
          </button>
        </nav>

        {/* ── Hero ── */}
        <section className="text-center px-4 sm:px-6 pt-12 sm:pt-16 pb-16 sm:pb-20 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Sparkles size={13} color="var(--color-pink-dim)" />
              <span className="text-xs font-semibold" style={{ color: 'var(--color-pink-dim)', letterSpacing: '0.06em' }}>
                8-AGENT AUTONOMOUS DEEP RESEARCH
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.1] mb-6"
              style={{ color: 'var(--color-ink)', letterSpacing: '-0.03em' }}>
              Academic papers,{' '}
              <span className="gradient-text">researched & drafted</span>
              <br />by AI agents
            </h1>

            <p className="text-sm sm:text-base md:text-lg mb-10 max-w-2xl mx-auto" style={{ color: 'var(--color-ink-soft)', lineHeight: 1.7 }}>
              Delve orchestrates 8 specialized AI agents to search academic sources,
              synthesize evidence, challenge findings, discover research gaps, and generate structured research manuscripts.
            </p>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={onSignIn}
                className="control-button control-button-primary text-sm font-semibold"
                style={{ padding: '0.85rem 2.2rem', borderRadius: 999 }}
              >
                Start Researching Free <ArrowRight size={15} />
              </motion.button>
            </div>
          </motion.div>
        </section>

        {/* ── Stats ── */}
        <section className="px-6 pb-20 max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STATS.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i + 0.2 }}
                className="card text-center p-5 shadow-lg"
              >
                <div className="text-2xl sm:text-3xl font-extrabold gradient-text mb-1">{stat.value}</div>
                <div className="text-xs font-medium" style={{ color: 'var(--color-ink-mute)' }}>{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Pipeline Section ── */}
        <section id="pipeline" className="px-6 pb-24 max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="mono-kicker mb-2 text-xs">Autonomous Architecture</p>
            <h2 className="text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
              The 8-Agent Deliberation Pipeline
            </h2>
            <p className="mt-2 text-sm max-w-lg mx-auto" style={{ color: 'var(--color-ink-soft)' }}>
              Each agent specializes in a distinct research phase, passing verified context through state graphs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PIPELINE_NODES.map((node, i) => {
              const Icon = node.icon;
              return (
                <motion.div
                  key={node.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="card p-5 flex flex-col justify-between shadow-md"
                >
                  <div>
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                      style={{ background: `${node.color}20` }}
                    >
                      <Icon size={18} color={node.color} />
                    </div>
                    <div className="font-semibold text-sm mb-1" style={{ color: 'var(--color-ink)' }}>
                      {node.label}
                    </div>
                    <div className="text-xs leading-relaxed" style={{ color: 'var(--color-ink-mute)' }}>
                      {node.desc}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t flex items-center justify-between text-[11px]" style={{ borderColor: 'var(--color-line)' }}>
                    <span style={{ color: 'var(--color-ink-mute)' }}>Phase {i + 1} of 8</span>
                    <span className="font-mono text-[10px] font-semibold" style={{ color: node.color }}>READY</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ── Features ── */}
        <section className="px-6 pb-24 max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="mono-kicker mb-2 text-xs">Features</p>
            <h2 className="text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
              Built for Academic Rigor
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className="card p-6 shadow-md">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: 'rgba(99,102,241,0.15)' }}>
                    <Icon size={16} color="var(--color-blue-dim)" />
                  </div>
                  <h3 className="font-bold text-sm mb-1.5" style={{ color: 'var(--color-ink)' }}>
                    {feat.title}
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--color-ink-soft)' }}>
                    {feat.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="px-6 pb-20 max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-7 sm:p-10 shadow-2xl"
            style={{ background: 'var(--gradient-card)', borderColor: 'rgba(99,102,241,0.3)' }}
          >
            <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--color-ink)' }}>
              Experience AI Research
            </h2>
            <p className="mb-6 text-sm" style={{ color: 'var(--color-ink-soft)' }}>
              Generate structured deep research papers in minutes. 5 free papers included per account.
            </p>
            <div className="flex gap-3 items-center justify-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={onSignIn}
                className="control-button control-button-primary text-xs font-semibold"
                style={{ padding: '0.75rem 2rem', borderRadius: 999 }}
              >
                Get Started Free <ArrowRight size={14} />
              </motion.button>
            </div>
          </motion.div>
        </section>

        {/* ── Footer ── */}
        <footer className="border-t text-center py-6 px-6"
          style={{ borderColor: 'var(--color-line)', color: 'var(--color-ink-mute)', fontSize: 12 }}>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Brain size={14} color="var(--color-blue-dim)" />
            <span className="font-semibold" style={{ color: 'var(--color-ink-soft)' }}>Delve</span>
          </div>
          Multi-Agent Academic Deep Research System
        </footer>
      </div>
    </div>
  );
}
