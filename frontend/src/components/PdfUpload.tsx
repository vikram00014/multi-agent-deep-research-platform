import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { Upload, FileText, X, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import type { UploadResponse } from '../types';

interface UploadedFile {
  file_id: string;
  filename: string;
  chunks_stored: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface PdfUploadProps {
  onFilesChange: (fileIds: string[]) => void;
}

export function PdfUpload({ onFilesChange }: PdfUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    const placeholder: UploadedFile = {
      file_id: `temp-${Date.now()}`,
      filename: file.name,
      chunks_stored: 0,
      status: 'uploading',
    };
    setFiles(prev => [...prev, placeholder]);

    try {
      const result: UploadResponse = await api.uploadPdf(file);
      setFiles(prev => {
        const updated = prev.map(f =>
          f.file_id === placeholder.file_id
            ? { ...result, status: 'done' as const }
            : f
        );
        onFilesChange(updated.filter(f => f.status === 'done').map(f => f.file_id));
        return updated;
      });
    } catch (err) {
      setFiles(prev =>
        prev.map(f =>
          f.file_id === placeholder.file_id
            ? { ...f, status: 'error' as const, error: (err as Error).message }
            : f
        )
      );
    }
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList)
      .filter(f => f.type === 'application/pdf')
      .forEach(handleUpload);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (fileId: string) => {
    setFiles(prev => {
      const updated = prev.filter(f => f.file_id !== fileId);
      onFilesChange(updated.filter(f => f.status === 'done').map(f => f.file_id));
      return updated;
    });
  };

  return (
    <div className="space-y-2">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center
          transition-all duration-300 backdrop-blur-sm
          ${isDragging
            ? 'border-orion-accent bg-orion-accent/10 scale-[1.01]'
            : 'border-orion-accent/20 bg-white/40 hover:bg-white/70 hover:shadow-md'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload className="mx-auto h-6 w-6 text-orion-text-dim mb-2" />
        <p className="text-sm text-orion-text-muted">
          Drop PDFs here or <span className="text-orion-accent-light underline">browse</span>
        </p>
      </div>

      {/* Uploaded Files */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map(f => (
            <div
              key={f.file_id}
              className="flex items-center gap-3 rounded-xl bg-white/80 backdrop-blur shadow-sm border border-orion-border/40 px-4 py-2.5 animate-fade-in hover:bg-white transition-colors"
            >
              <FileText className="h-4 w-4 text-orion-accent shrink-0" />
              <span className="text-sm text-orion-text-muted truncate flex-1">{f.filename}</span>
              {f.status === 'uploading' && <Loader2 className="h-4 w-4 text-orion-accent animate-spin" />}
              {f.status === 'done' && (
                <span className="flex items-center gap-1 text-xs text-orion-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {f.chunks_stored} chunks
                </span>
              )}
              {f.status === 'error' && (
                <span className="text-xs text-orion-error">{f.error}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(f.file_id); }}
                className="p-1 rounded-md hover:bg-orion-surface-3 transition-colors"
              >
                <X className="h-3.5 w-3.5 text-orion-text-dim" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
