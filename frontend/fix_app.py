import sys
import re

path = r'c:\Users\vikra\Desktop\multi-agent-deep-research-platform\frontend\src\App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = ": activeTab === 'resources' ? ("
end_marker = ") : null}"

idx_start = content.find(start_marker)
idx_end = content.find(end_marker, idx_start)

if idx_start == -1 or idx_end == -1:
    print(f"Markers not found: start={idx_start}, end={idx_end}")
    sys.exit(1)

new_section = """: activeTab === 'resources' ? (
            <div className="h-full overflow-y-auto p-6 md:p-10 animate-fade-in relative bg-slate-50/30">
              <div className="max-w-6xl mx-auto space-y-8 relative z-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <h2 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Research Library</h2>
                    <p className="text-slate-500 font-medium max-w-lg">Access all synthesized sources, verified citations, and generated artifacts from your research session.</p>
                  </div>
                  <button
                    onClick={refreshSessionDetail}
                    disabled={!currentSessionId}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Refresh Library
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-6">
                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <FileText className="h-5 w-5 text-indigo-600" />
                        <h3 className="text-xl font-bold text-slate-800">Synthesized Sources</h3>
                      </div>
                      
                      {resourceBibliography.length === 0 ? (
                        <div className="card-premium flex flex-col items-center justify-center py-16 text-center">
                          <div className="p-4 rounded-full bg-slate-50 mb-4">
                            <FolderArchive className="h-10 w-10 text-slate-300" />
                          </div>
                          <p className="text-slate-400 font-medium">No sources synthesized yet.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4">
                          {resourceBibliography.map((b, i) => (
                            <div key={`${String(b.paper_id || i)}-${i}`} className="card-premium !p-6 flex flex-col md:flex-row gap-6 items-start">
                              <div className="w-12 h-12 shrink-0 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xl">
                                {i + 1}
                              </div>
                              <div className="flex-1">
                                <h4 className="text-lg font-bold text-slate-900 leading-snug mb-1">{String(b.title || 'Untitled Source')}</h4>
                                <p className="text-slate-500 text-sm font-medium mb-3">{String(b.authors || 'Unknown Authors')} · {String(b.year || 'n.d.')}</p>
                                <div className="flex flex-wrap gap-2">
                                  {b.verified && <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Verified</span>}
                                  {b.doi && <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">DOI: {String(b.doi)}</span>}
                                  {b.url && <a href={String(b.url)} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200 hover:bg-slate-200">View Source</a>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>

                  <div className="space-y-6">
                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <Download className="h-5 w-5 text-indigo-600" />
                        <h3 className="text-xl font-bold text-slate-800">Export Artifacts</h3>
                      </div>
                      <div className="space-y-3">
                        <button
                          onClick={handleExport}
                          disabled={!currentSessionId || !effectiveComplete}
                          className="w-full card-premium !p-5 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all"><FolderArchive className="h-5 w-5" /></div>
                            <div className="text-left">
                              <p className="font-bold text-slate-900">Research Bundle</p>
                              <p className="text-xs text-slate-500">JSON Archive</p>
                            </div>
                          </div>
                          <Download className="h-5 w-5 text-slate-400 group-hover:text-indigo-600" />
                        </button>
                        
                        <button
                          onClick={() => {
                            if (!currentSessionId) return;
                            api.getPaper(currentSessionId).then((p) => {
                              const blob = new Blob([p.paper || ''], { type: 'text/markdown' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `orion-paper-${currentSessionId.slice(0, 8)}.md`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }).catch(() => {});
                          }}
                          disabled={!currentSessionId || !effectiveComplete}
                          className="w-full card-premium !p-5 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all"><FileText className="h-5 w-5" /></div>
                            <div className="text-left">
                              <p className="font-bold text-slate-900">Final Manuscript</p>
                              <p className="text-xs text-slate-500">Markdown Format</p>
                            </div>
                          </div>
                          <Download className="h-5 w-5 text-slate-400 group-hover:text-emerald-600" />
                        </button>

                        <button
                          onClick={() => window.print()}
                          disabled={!currentSessionId || !effectiveComplete}
                          className="w-full card-premium !p-5 flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white transition-all"><FileText className="h-5 w-5" /></div>
                            <div className="text-left">
                              <p className="font-bold text-slate-900">PDF Report</p>
                              <p className="text-xs text-slate-500">Export for Print</p>
                            </div>
                          </div>
                          <Download className="h-5 w-5 text-slate-400 group-hover:text-rose-600" />
                        </button>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-3 mb-4">
                        <Activity className="h-5 w-5 text-indigo-600" />
                        <h3 className="text-xl font-bold text-slate-800">Session Files</h3>
                      </div>
                      <div className="card-premium !p-4 space-y-2">
                        {sessionResources.length === 0 ? (
                          <p className="text-slate-400 text-sm font-medium text-center py-4">No individual files saved.</p>
                        ) : (
                          sessionResources.map((f) => (
                            <a
                              key={f.name}
                              href={currentSessionId ? api.resourceDownloadUrl(currentSessionId, f.name) : '#'}
                              className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 group transition-all"
                            >
                              <span className="text-sm font-bold text-slate-600 group-hover:text-indigo-600">{f.name}</span>
                              <span className="text-xs text-slate-400">{(f.size_bytes / 1024).toFixed(1)} KB</span>
                            </a>
                          ))
                        )}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
"""

result = content[:idx_start] + new_section + content[idx_end:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(result)
print("Successfully updated App.tsx")
