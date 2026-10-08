import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Brain,
  FileText,
  FlaskConical,
  GitBranch,
  Layers,
  Search,
  ShieldCheck,
  Sparkles,
  Zap
} from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
}

const PIPELINE_NODES = [
  { icon: Brain,        phase: '01', title: 'Research Planner',    role: 'Formulates research questions, search queries, and retrieval parameters.' },
  { icon: Search,       phase: '02', title: 'Academic Retrieval',  role: 'Queries arXiv, OpenAlex, Crossref, Semantic Scholar, GitHub, and Tavily.' },
  { icon: BookOpen,     phase: '03', title: 'Paper Summarizer',    role: 'Extracts methodology, datasets, empirical findings, and stated limitations.' },
  { icon: Layers,       phase: '04', title: 'Literature Proposer', role: 'Synthesizes primary sources into structured thematic review sections.' },
  { icon: FlaskConical, phase: '05', title: 'Peer Review Critic',  role: 'Challenges methodological assumptions, evidence gaps, and validity.' },
  { icon: GitBranch,    phase: '06', title: 'Cross-Paper Analyst', role: 'Maps citations, consensus patterns, and conflicting empirical results.' },
  { icon: Sparkles,     phase: '07', title: 'Gap Discovery',       role: 'Identifies unexplored research frontiers with grounded justifications.' },
  { icon: Zap,          phase: '08', title: 'Paper Architect',     role: 'Assembles manuscripts formatted in IEEE, ACM, APA, or MLA standards.' },
];

const PLATFORM_CAPABILITIES = [
  {
    icon: Search,
    title: 'Multi-Source Literature Retrieval',
    desc: 'Federated academic querying across arXiv, Crossref, Semantic Scholar, OpenAlex, GitHub repositories, and Tavily academic search.',
  },
  {
    icon: FlaskConical,
    title: 'Adversarial Proposer–Critic Review',
    desc: 'Independent agents conduct multi-round peer deliberation to challenge unsupported claims, verify evidence, and strengthen rigor.',
  },
  {
    icon: ShieldCheck,
    title: 'Automated Citation & DOI Verification',
    desc: 'Resolves digital object identifiers, cross-references author metadata, and generates an evidence audit trail for every citation.',
  },
  {
    icon: Sparkles,
    title: 'Evidence-Backed Gap Analysis',
    desc: 'Surfaces unexplored problem spaces and unanswered questions directly tied to contradictory or sparse literature findings.',
  },
  {
    icon: Zap,
    title: 'Live Deliberation Stream',
    desc: 'Observe agent reasoning, claim validation, search queries, and debate arguments live as the synthesis progresses.',
  },
  {
    icon: FileText,
    title: 'Reference Paper Synthesis',
    desc: 'Upload unpublished manuscripts or private documentation to ground synthesis directly in your source files.',
  },
];

const ARCHITECTURE_METRICS = [
  { value: '8', label: 'Autonomous Agents', sub: 'Collaborative research pipeline' },
  { value: '6', label: 'Academic Indexes', sub: 'Live repository connections' },
  { value: '100%', label: 'Verified Citations', sub: 'Direct DOI cross-referencing' },
  { value: '4+', label: 'Publication Standards', sub: 'IEEE, ACM, APA, MLA formats' },
];

export function LandingPage({ onSignIn }: LandingPageProps) {
  return (
    <div className="landing-scroll">
      {/* ── Top Header Navigation ── */}
      <header className="border-b bg-surface sticky top-0 z-30" style={{ borderColor: 'var(--color-line)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-8 h-16 safe-top">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary text-white flex items-center justify-center font-bold text-sm">
              <Brain size={16} />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-ink">ResearchAgent</span>
              <span className="hidden sm:inline-block ml-2 text-[11px] text-ink-mute font-mono">v2.4</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSignIn}
              className="control-button control-button-primary text-xs"
            >
              Sign In to Workspace <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <main>
        <section className="px-4 sm:px-8 pt-16 sm:pt-24 pb-16 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md mb-6 border border-line bg-surface">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="mono-kicker text-[10px]">Autonomous Academic Deliberation Engine</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-ink leading-[1.15] mb-6">
              Autonomous Deep Research & Publication Synthesis
            </h1>

            <p className="text-base sm:text-lg text-ink-soft max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
              An orchestrated system of 8 specialized AI agents that retrieves primary academic literature,
              conducts adversarial peer deliberation, validates citations, and authors structured manuscripts.
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={onSignIn}
                className="control-button control-button-primary text-sm px-5 py-2.5"
                style={{ minHeight: 42 }}
              >
                Open Research Workspace <ArrowRight size={15} />
              </button>
              <a
                href="#pipeline"
                className="control-button text-sm px-4 py-2.5"
                style={{ minHeight: 42 }}
              >
                Explore Agent Architecture
              </a>
            </div>
          </motion.div>
        </section>

        {/* ── Architecture Metrics ── */}
        <section className="px-4 sm:px-8 pb-20 max-w-5xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {ARCHITECTURE_METRICS.map((metric) => (
              <div key={metric.label} className="card p-5 text-left">
                <div className="font-mono text-2xl sm:text-3xl font-bold text-ink mb-1">
                  {metric.value}
                </div>
                <div className="text-xs font-semibold text-ink-soft">
                  {metric.label}
                </div>
                <div className="text-[11px] text-ink-mute mt-0.5">
                  {metric.sub}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 8-Agent Pipeline Section ── */}
        <section id="pipeline" className="px-4 sm:px-8 py-20 border-t bg-surface" style={{ borderColor: 'var(--color-line)' }}>
          <div className="max-w-6xl mx-auto">
            <div className="max-w-2xl mb-12">
              <p className="mono-kicker text-xs mb-2">Autonomous Workflow</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
                The 8-Agent Deliberation Pipeline
              </h2>
              <p className="mt-2 text-sm sm:text-base text-ink-soft leading-relaxed">
                Rather than generating text in a single pass, the system executes a collaborative multi-agent pipeline.
                Each phase reviews, critiques, and refines evidence before the final manuscript is authored.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {PIPELINE_NODES.map((node) => {
                const Icon = node.icon;
                return (
                  <div
                    key={node.phase}
                    className="card p-4 sm:p-5 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3 text-ink-mute">
                        <span className="font-mono text-xs font-semibold text-ink-mute">Phase {node.phase}</span>
                        <Icon size={16} className="text-ink-soft" />
                      </div>
                      <h3 className="font-semibold text-sm sm:text-base text-ink mb-1.5">
                        {node.title}
                      </h3>
                      <p className="text-xs sm:text-[13px] text-ink-mute leading-relaxed">
                        {node.role}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-ink-mute" style={{ borderColor: 'var(--color-line)' }}>
                      <span>Research Phase</span>
                      <span className="font-mono text-[11px] text-ink-soft font-medium">Ready</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Platform Capabilities ── */}
        <section className="px-4 sm:px-8 py-20 max-w-6xl mx-auto">
          <div className="max-w-2xl mb-12">
            <p className="mono-kicker text-xs mb-2">Methodological Precision</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              Engineered for Scientific Rigor
            </h2>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">
              Every section, claim, and equation is audited through rigorous evidentiary benchmarks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORM_CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <div key={cap.title} className="card p-5 sm:p-6">
                  <div className="w-8 h-8 rounded-md border border-line bg-surface-subtle flex items-center justify-center mb-4 text-ink">
                    <Icon size={16} />
                  </div>
                  <h3 className="font-semibold text-sm text-ink mb-2">
                    {cap.title}
                  </h3>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    {cap.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Ready to Start CTA ── */}
        <section className="px-4 sm:px-8 py-16 border-t bg-surface" style={{ borderColor: 'var(--color-line)' }}>
          <div className="max-w-3xl mx-auto text-center card p-8 sm:p-12">
            <p className="mono-kicker text-xs mb-2">Production Research Engine</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight mb-3">
              Synthesize Literature with Autonomous Agents
            </h2>
            <p className="text-sm text-ink-soft max-w-xl mx-auto mb-8 leading-relaxed">
              Authenticate to launch multi-agent research runs, track live deliberation feeds,
              and export publication-ready PDF manuscripts with KaTeX math and verified citations.
            </p>
            <button
              onClick={onSignIn}
              className="control-button control-button-primary text-sm px-6 py-2.5"
              style={{ minHeight: 40 }}
            >
              Sign In to Delve Workspace <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t py-8 px-4 sm:px-8" style={{ borderColor: 'var(--color-line)' }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-mute">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary text-white flex items-center justify-center font-bold text-[10px]">
              <Brain size={11} />
            </div>
            <span className="font-semibold text-ink">ResearchAgent</span>
            <span>— Autonomous Multi-Agent Academic Synthesis</span>
          </div>
          <div className="font-mono text-[11px]">
            IEEE · ACM · APA · MLA Compliant Output
          </div>
        </div>
      </footer>
    </div>
  );
}
