import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#6366f1',
    primaryTextColor: '#1e293b',
    primaryBorderColor: '#e2e8f0',
    lineColor: '#94a3b8',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#f1f5f9',
    fontFamily: 'Inter, sans-serif'
  },
  securityLevel: 'loose',
  flowchart: { 
    htmlLabels: true,
    curve: 'basis',
    useMaxWidth: true
  },
  mindmap: {
    useMaxWidth: true
  }
});

interface MermaidProps {
  chart: string;
}

export function Mermaid({ chart }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      try {
        // Sanitize chart string before passing to mermaid
        let cleanChart = chart.trim();

        if (cleanChart.includes('mindmap')) {
          ref.current.innerHTML = `
            <div class="p-4 border border-amber-500/20 bg-amber-500/8 text-amber-700 rounded-xl text-xs">
              <p class="font-semibold">Mindmap visualization skipped for this saved report.</p>
            </div>
          `;
          return;
        }
        
        // Fix common mermaid syntax issues:
        // 1. Unquoted labels containing brackets or parens in mindmaps
        if (cleanChart.includes('mindmap')) {
           cleanChart = cleanChart.replace(/(\s+)([A-Za-z0-9_-]+)(\s*)\(([^)]+)\)/g, '$1$2$3["$4"]');
        }

        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const strippedChart = cleanChart.replace(/<[^>]+>/g, ' ');

        mermaid.parse(strippedChart)
          .then(() => mermaid.render(id, strippedChart))
          .then(({ svg }) => {
            if (ref.current) {
              ref.current.innerHTML = svg;
            }
          })
          .catch(() => {
            if (ref.current) {
              ref.current.innerHTML = `
                <div class="p-4 border border-amber-500/20 bg-amber-500/8 text-amber-700 rounded-xl text-xs">
                  <p class="font-semibold">Visualization unavailable for this section.</p>
                </div>
              `;
            }
          });
      } catch (e) {
        if (ref.current) {
          ref.current.innerHTML = `
            <div class="p-4 border border-amber-500/20 bg-amber-500/8 text-amber-700 rounded-xl text-xs">
              <p class="font-semibold">Visualization unavailable for this section.</p>
            </div>
          `;
        }
      }
    }
  }, [chart]);

  return <div ref={ref} className="mermaid-chart flex justify-center my-10 p-8 bg-white/50 rounded-[2rem] border border-slate-100 shadow-sm" />;
}
