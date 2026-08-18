import { supabase } from './supabase';
import type { UserQuota } from './types';

export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

async function parseApiError(resp: Response, fallbackMessage: string): Promise<Error> {
  try {
    const errorJson = await resp.json();
    if (errorJson && typeof errorJson.detail === 'string' && errorJson.detail.trim()) {
      return new Error(errorJson.detail);
    }
  } catch {
    // Ignore JSON parsing failure
  }
  return new Error(resp.statusText || fallbackMessage);
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in to continue');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

/**
 * API client for Delve backend.
 */
export const api = {
  async startResearchAdvanced(payload: {
    topic: string;
    uploaded_paper_ids?: string[];
    max_debate_rounds?: number;
    strict_mode?: boolean;
    paper_format?: string;
    depth?: 'quick' | 'standard' | 'deep';
    year_from?: number;
    include_sources?: string[];
    exclude_sources?: string[];
  }) {
    const resp = await apiFetch('/research/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw await parseApiError(resp, 'Failed to start research');
    return resp.json();
  },

  /**
   * Get the paper result for a completed session.
   */
  async getPaper(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}/paper`);
    if (!resp.ok) throw await parseApiError(resp, 'Failed to get paper');
    return resp.json();
  },

  /**
   * Get session status.
   */
  async getSessionStatus(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}/status`);
    if (!resp.ok) throw await parseApiError(resp, 'Failed to get status');
    return resp.json();
  },

  /**
   * Get session timeline feed (persisted server-side).
   */
  async getTimeline(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}/timeline`);
    if (!resp.ok) throw await parseApiError(resp, 'Failed to get timeline');
    return resp.json();
  },

  async getSessionDetail(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}/detail`);
    if (!resp.ok) throw await parseApiError(resp, 'Failed to get session detail');
    return resp.json();
  },

  async cancelSession(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}/cancel`, { method: 'POST' });
    if (!resp.ok) throw await parseApiError(resp, 'Failed to cancel session');
    return resp.json();
  },

  async retrySession(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}/retry`, { method: 'POST' });
    if (!resp.ok) throw await parseApiError(resp, 'Failed to retry session');
    return resp.json();
  },

  async deleteSession(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}`, { method: 'DELETE' });
    if (!resp.ok) throw await parseApiError(resp, 'Failed to delete session');
    return resp.json();
  },

  async downloadPaperPdf(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}/paper.pdf`);
    if (!resp.ok) throw await parseApiError(resp, 'Failed to download PDF');
    return resp.blob();
  },

  /**
   * List all sessions.
   */
  async listSessions() {
    const resp = await apiFetch('/research/sessions/list');
    if (!resp.ok) throw await parseApiError(resp, 'Failed to list sessions');
    return resp.json();
  },

  /**
   * Upload a PDF file.
   */
  async uploadPdf(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const resp = await apiFetch('/upload/pdf', {
      method: 'POST',
      body: formData,
    });
    if (!resp.ok) throw await parseApiError(resp, 'Upload failed');
    return resp.json();
  },

  async createWebSocketTicket(sessionId: string) {
    const resp = await apiFetch(`/research/${sessionId}/ws-ticket`, { method: 'POST' });
    if (!resp.ok) throw await parseApiError(resp, 'Could not authorize live updates');
    return resp.json() as Promise<{ ticket: string }>;
  },

  /**
   * Get user quota information.
   */
  async getQuota(): Promise<UserQuota> {
    const resp = await apiFetch('/research/quota');
    if (!resp.ok) throw await parseApiError(resp, 'Failed to fetch quota information');
    return resp.json();
  },
};
