import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { Check, FileText, Upload, X, Loader2 } from 'lucide-react';
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

  const publishDoneIds = (nextFiles: UploadedFile[]) => {
    onFilesChange(nextFiles.filter((file) => file.status === 'done').map((file) => file.file_id));
  };

  const handleUpload = async (file: File) => {
    const placeholder: UploadedFile = {
      file_id: `temp-${Date.now()}-${file.name}`,
      filename: file.name,
      chunks_stored: 0,
      status: 'uploading',
    };
    setFiles((current) => [...current, placeholder]);

    try {
      const result: UploadResponse = await api.uploadPdf(file);
      setFiles((current) => {
        const updated = current.map((item) =>
          item.file_id === placeholder.file_id ? { ...result, status: 'done' as const } : item,
        );
        publishDoneIds(updated);
        return updated;
      });
    } catch (err) {
      setFiles((current) =>
        current.map((item) =>
          item.file_id === placeholder.file_id
            ? { ...item, status: 'error' as const, error: err instanceof Error ? err.message : 'Upload failed' }
            : item,
        ),
      );
    }
  };

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    Array.from(fileList)
      .filter((file) => file.name.toLowerCase().endsWith('.pdf'))
      .forEach((file) => {
        void handleUpload(file);
      });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  const removeFile = (fileId: string) => {
    setFiles((current) => {
      const updated = current.filter((file) => file.file_id !== fileId);
      publishDoneIds(updated);
      return updated;
    });
  };

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border border-dashed px-4 py-5 text-center transition-all cursor-pointer"
        style={{
          borderColor: isDragging ? 'var(--color-blue)' : 'var(--color-line)',
          background: isDragging ? 'rgba(99,102,241,0.1)' : 'var(--color-surface)',
        }}
        aria-label="Upload PDF files"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files)}
          className="sr-only"
        />
        <Upload className="mx-auto mb-2 h-5 w-5" style={{ color: 'var(--color-blue-dim)' }} />
        <p className="text-xs font-semibold" style={{ color: 'var(--color-ink)' }}>Drop reference PDFs here or browse</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-ink-mute)' }}>Extracted text will be indexed into pgvector for RAG grounding</p>
      </div>

      {files.length > 0 ? (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div
              key={file.file_id}
              className="flex items-center gap-2.5 p-2.5 rounded-lg border text-xs"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}
            >
              <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--color-blue-dim)' }} />
              <span className="min-w-0 flex-1 truncate font-medium" style={{ color: 'var(--color-ink-soft)' }}>
                {file.filename}
              </span>
              {file.status === 'uploading' && (
                <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-blue-dim)' }}>
                  <Loader2 size={12} className="animate-spin" /> Indexing…
                </span>
              )}
              {file.status === 'done' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ok">
                  <Check size={12} /> {file.chunks_stored} passages indexed
                </span>
              )}
              {file.status === 'error' && (
                <span className="max-w-[180px] truncate text-[11px] text-err">{file.error}</span>
              )}
              <button
                type="button"
                onClick={() => removeFile(file.file_id)}
                className="p-1 rounded hover:bg-white/5"
                style={{ color: 'var(--color-ink-mute)' }}
                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--color-err)')}
                onMouseOut={(e) => (e.currentTarget.style.color = 'var(--color-ink-mute)')}
                aria-label={`Remove ${file.filename}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
