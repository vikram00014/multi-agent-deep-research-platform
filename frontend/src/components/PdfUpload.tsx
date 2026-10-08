import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { Check, FileText, Upload, X, Loader2, AlertCircle } from 'lucide-react';
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
        className={`rounded-md border border-dashed p-4 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-ink bg-surface-subtle'
            : 'border-line bg-surface hover:border-line-strong'
        }`}
        aria-label="Upload PDF reference documents"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={(event: ChangeEvent<HTMLInputElement>) => handleFiles(event.target.files)}
          className="sr-only"
        />
        <Upload className="mx-auto mb-1.5 h-4 w-4 text-ink-mute" />
        <p className="text-xs font-semibold text-ink">Drop reference PDFs here or browse to upload</p>
        <p className="text-xs text-ink-mute mt-0.5">Uploaded papers will be synthesized and cited directly in your research manuscript</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div
              key={file.file_id}
              className="flex items-center gap-2 p-2 rounded border border-line bg-surface text-xs"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
              <span className="min-w-0 flex-1 truncate font-medium text-ink-soft">
                {file.filename}
              </span>
              {file.status === 'uploading' && (
                <span className="flex items-center gap-1 text-xs text-accent">
                  <Loader2 size={12} className="animate-spin" /> Processing…
                </span>
              )}
              {file.status === 'done' && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
                  <Check size={12} /> {file.chunks_stored} passages ready
                </span>
              )}
              {file.status === 'error' && (
                <span className="flex items-center gap-1 text-[11px] text-err">
                  <AlertCircle size={11} /> {file.error || 'Upload error'}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeFile(file.file_id)}
                className="p-1 rounded text-ink-mute hover:text-err transition-colors"
                aria-label={`Remove ${file.filename}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
