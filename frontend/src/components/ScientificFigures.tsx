import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, Layers, Sparkles, Activity, CheckCircle2 } from 'lucide-react';

interface FigureProps {
  topic?: string;
}

export const Figure1Architecture: React.FC<FigureProps> = ({ topic }) => {
  const isMed = /medical|segmentation|vision|image|tumor|organ/i.test(topic || '');

  return (
    <figure className="my-6 rounded-md border border-line bg-surface p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between pb-2.5 mb-3.5 border-b border-line text-xs">
        <span className="font-semibold text-ink flex items-center gap-1.5">
          <Layers size={14} className="text-accent" />
          Figure 1: End-to-End Architectural Pipeline & Multi-Scale Feature Integration
        </span>
        <span className="badge badge-blue text-[10px]">Methodology Flow</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 items-center text-xs">
        {/* Step 1: Input */}
        <div className="rounded border border-line bg-surface-subtle p-3 flex flex-col items-center text-center">
          <div className="p-1 rounded bg-surface border border-line text-ink mb-1.5">
            <Cpu size={14} />
          </div>
          <span className="font-semibold text-ink text-[11px] mb-0.5">Input Modality</span>
          <span className="text-[10px] text-ink-mute font-mono">
            {isMed ? 'X ∈ ℝ^(H×W×C)\n(CT / MRI Stream)' : 'Domain Input X\nRaw High-Res Stream'}
          </span>
        </div>

        {/* Step 2: Dual Branch */}
        <div className="flex flex-col gap-2">
          <div className="rounded border border-line bg-surface p-2 text-center">
            <span className="font-semibold text-ink text-[11px] block">Local CNN Branch</span>
            <span className="text-[10px] text-ink-mute">Dynamic Deformable Conv (DDConv)</span>
          </div>
          <div className="rounded border border-line bg-surface p-2 text-center">
            <span className="font-semibold text-ink text-[11px] block">Global Context ViT</span>
            <span className="text-[10px] text-ink-mute">Shifted-Window Self-Attention</span>
          </div>
        </div>

        {/* Step 3: Adaptive Fusion */}
        <div className="rounded border border-line bg-surface-subtle p-3 flex flex-col items-center text-center">
          <div className="p-1 rounded bg-surface border border-line text-ink mb-1.5">
            <Sparkles size={14} />
          </div>
          <span className="font-semibold text-ink text-[11px] mb-0.5">Adaptive Fusion Block</span>
          <span className="text-[10px] text-ink-mute">
            Φ(f_CNN, f_ViT) · 2D DCT Frequency Refinement
          </span>
        </div>

        {/* Step 4: Progressive Decoder */}
        <div className="rounded border border-line bg-surface p-3 flex flex-col items-center text-center">
          <div className="p-1 rounded bg-surface border border-line text-ink mb-1.5">
            <Layers size={14} />
          </div>
          <span className="font-semibold text-ink text-[11px] mb-0.5">Progressive Decoder</span>
          <span className="text-[10px] text-ink-mute">
            Multi-Scale Upsampling & Boundary Alignment
          </span>
        </div>

        {/* Step 5: Output Mask */}
        <div className="rounded border border-line bg-surface-subtle p-3 flex flex-col items-center text-center">
          <div className="p-1 rounded bg-surface border border-line text-ok mb-1.5">
            <CheckCircle2 size={14} />
          </div>
          <span className="font-semibold text-ink text-[11px] mb-0.5">Output Mask</span>
          <span className="text-[10px] text-ink-mute font-mono">
            {isMed ? 'S ∈ {0,1}^(H×W)\nDSC / HD95 Metric Loss' : 'Prediction Map\nOptimized Verification'}
          </span>
        </div>
      </div>

      <figcaption className="mt-3 pt-2 border-t border-line text-[11px] text-ink-mute italic text-center">
        Figure 1: Architectural framework of hybrid vision transformer and convolutional networks with multi-scale feature integration.
      </figcaption>
    </figure>
  );
};

export const Figure2Tradeoff: React.FC = () => {
  const models = [
    { name: 'CVMH-UNet [1]', cat: 'Mamba SSM', dsc: 90.2, lat: 14.8, params: 28 },
    { name: 'CiT-Net [5]', cat: 'Hybrid CNN-ViT', dsc: 89.4, lat: 24.5, params: 42 },
    { name: 'GMSA [6]', cat: 'Grouped ViT', dsc: 88.9, lat: 28.2, params: 38 },
    { name: 'MCPA [3]', cat: 'Multi-Scale ViT', dsc: 88.7, lat: 42.1, params: 55 },
    { name: 'Lgenet [4]', cat: 'External-Corr ViT', dsc: 91.1, lat: 68.4, params: 96 },
  ];

  return (
    <figure className="my-6 rounded-md border border-line bg-surface p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between pb-2.5 mb-3.5 border-b border-line text-xs">
        <span className="font-semibold text-ink flex items-center gap-1.5">
          <Activity size={14} className="text-ink-mute" />
          Figure 2: Empirical Pareto Frontier — Accuracy vs. Edge Latency Trade-off
        </span>
        <span className="badge badge-blue text-[10px]">Benchmark</span>
      </div>

      <div className="space-y-2.5">
        {models.map((m) => {
          const isRealTime = m.lat <= 33.3;
          return (
            <div key={m.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded border border-line bg-surface-subtle">
              <div className="flex items-center gap-2 min-w-[170px]">
                <div>
                  <span className="font-bold text-ink text-xs block">{m.name}</span>
                  <span className="text-[10px] text-ink-mute">{m.cat} · {m.params}M params</span>
                </div>
              </div>

              {/* Visual Bars */}
              <div className="flex-1 grid grid-cols-2 gap-3 max-w-md">
                {/* Accuracy */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1 font-medium text-ink-soft">
                    <span>DSC Score</span>
                    <span className="font-bold font-mono text-ink">{m.dsc}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${(m.dsc - 80) * 8}%` }} 
                      transition={{ duration: 0.5 }}
                      className="h-full bg-primary" 
                    />
                  </div>
                </div>

                {/* Latency */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1 font-medium text-ink-soft">
                    <span>Edge Latency</span>
                    <span className={`font-bold font-mono ${isRealTime ? 'text-ok' : 'text-err'}`}>{m.lat} ms</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${Math.min(100, (m.lat / 70) * 100)}%` }} 
                      transition={{ duration: 0.5 }}
                      className={`h-full ${isRealTime ? 'bg-ok' : 'bg-err'}`} 
                    />
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="shrink-0 text-right">
                {isRealTime ? (
                  <span className="badge badge-green text-[10px]">
                    ✓ Real-time (&lt;33ms)
                  </span>
                ) : (
                  <span className="badge text-[10px]">
                    Offline Batch
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <figcaption className="mt-3.5 pt-2 border-t border-line text-[11px] text-ink-mute italic text-center">
        Figure 2: Empirical trade-off between segmentation accuracy (DSC %) and real-time edge inference latency across representative paradigms. The 33.3ms threshold marks the clinical 30 FPS boundary.
      </figcaption>
    </figure>
  );
};
