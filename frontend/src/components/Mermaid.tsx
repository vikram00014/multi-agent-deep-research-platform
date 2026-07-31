import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: 'oklch(0.24 0.008 265)',
    primaryTextColor: 'oklch(0.95 0.004 265)',
    primaryBorderColor: 'oklch(0.30 0.008 265)',
    lineColor: 'oklch(0.58 0.010 265)',
    secondaryColor: 'oklch(0.20 0.007 265)',
    tertiaryColor: 'oklch(0.16 0.006 265)',
    fontFamily: 'Inter Tight, ui-sans-serif, system-ui, sans-serif',
  },
  securityLevel: 'loose',
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    useMaxWidth: true,
  },
  mindmap: {
    useMaxWidth: true,
  },
});

interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const [status, setStatus] = useState<'ready' | 'skipped' | 'error'>('ready');

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.innerHTML = '';
    setStatus('ready');

    const cleanChart = chart.trim();
    if (cleanChart.includes('mindmap')) {
      setStatus('skipped');
      return;
    }

    const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const strippedChart = cleanChart.replace(/<[^>]+>/g, ' ');

    mermaid.parse(strippedChart)
      .then(() => mermaid.render(id, strippedChart))
      .then(({ svg }) => {
        if (ref.current) {
          ref.current.innerHTML = svg;
        }
      })
      .catch(() => {
        setStatus('error');
      });
  }, [chart, rawId]);

  return (
    <figure className="my-8 rounded-card border border-line bg-raised p-6">
      <div ref={ref} className="flex justify-center overflow-x-auto" />
      {status === 'skipped' ? (
        <div className="rounded-card border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn">
          Mindmap visualization skipped for this saved report.
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="rounded-card border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn">
          Visualization unavailable for this section.
        </div>
      ) : null}
      <figcaption className="mono-kicker mt-4">Diagram</figcaption>
    </figure>
  );
}
