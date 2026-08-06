import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { Check, FileText, Upload, X } from 'lucide-react';
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
        className={`rounded-card border border-dashed px-4 py-5 text-center transition-colors ${
          isDragging ? 'border-accent bg-accent/10' : 'border-line bg-surface hover:border-accent-dim'
        }`}
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
        <Upload className="mx-auto mb-2 h-5 w-5 text-ink-mute" />
        <p className="text-sm text-ink-soft">Drop PDFs here or browse</p>
      </div>

      {files.length > 0 ? (
        <div className="space-y-1">
          {files.map((file) => (
            <div key={file.file_id} className="flex items-center gap-2 border-b border-line py-2">
              <FileText className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-soft">{file.filename}</span>
              {file.status === 'uploading' ? (
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-accent">uploading</span>
              ) : null}
              {file.status === 'done' ? (
                <span className="inline-flex items-center gap-1 font-mono text-[12px] uppercase tracking-[0.12em] text-ok">
                  <Check className="h-3 w-3" />
                  {file.chunks_stored} chunks
                </span>
              ) : null}
              {file.status === 'error' ? (
                <span className="max-w-[180px] truncate text-xs text-err">{file.error}</span>
              ) : null}
              <button
                type="button"
                onClick={() => removeFile(file.file_id)}
                className="rounded-card p-1 text-ink-mute hover:text-err"
                aria-label={`Remove ${file.filename}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
