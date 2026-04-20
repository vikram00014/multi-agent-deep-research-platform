const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

/**
 * API client for ORION backend.
 */
export const api = {
  /**
   * Start a new research session.
   */
  async startResearch(topic: string, uploadedPaperIds: string[] = []) {
    const resp = await fetch(`${API_BASE}/research/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        uploaded_paper_ids: uploadedPaperIds,
      }),
    });
    if (!resp.ok) throw new Error(`Failed to start research: ${resp.statusText}`);
    return resp.json();
  },

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
    const resp = await fetch(`${API_BASE}/research/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`Failed to start research: ${resp.statusText}`);
    return resp.json();
  },

  /**
   * Get the paper result for a completed session.
   */
  async getPaper(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/paper`);
    if (!resp.ok) throw new Error(`Failed to get paper: ${resp.statusText}`);
    return resp.json();
  },

  /**
   * Get session status.
   */
  async getSessionStatus(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/status`);
    if (!resp.ok) throw new Error(`Failed to get status: ${resp.statusText}`);
    return resp.json();
  },

  /**
   * Get session timeline feed (persisted server-side).
   */
  async getTimeline(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/timeline`);
    if (!resp.ok) throw new Error(`Failed to get timeline: ${resp.statusText}`);
    return resp.json();
  },

  async getSessionDetail(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/detail`);
    if (!resp.ok) throw new Error(`Failed to get session detail: ${resp.statusText}`);
    return resp.json();
  },

  async cancelSession(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/cancel`, { method: 'POST' });
    if (!resp.ok) throw new Error(`Failed to cancel session: ${resp.statusText}`);
    return resp.json();
  },

  async retrySession(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/retry`, { method: 'POST' });
    if (!resp.ok) throw new Error(`Failed to retry session: ${resp.statusText}`);
    return resp.json();
  },

  async deleteSession(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error(`Failed to delete session: ${resp.statusText}`);
    return resp.json();
  },

  async exportBundle(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/export`);
    if (!resp.ok) throw new Error(`Failed to export bundle: ${resp.statusText}`);
    return resp.json();
  },

  async listSessionResources(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/resources/list`);
    if (!resp.ok) throw new Error(`Failed to list resources: ${resp.statusText}`);
    return resp.json();
  },

  resourceDownloadUrl(sessionId: string, fileName: string) {
    return `${API_BASE}/research/${sessionId}/resources/download/${encodeURIComponent(fileName)}`;
  },

  /**
   * List all sessions.
   */
  async listSessions() {
    const resp = await fetch(`${API_BASE}/research/sessions/list`);
    if (!resp.ok) throw new Error(`Failed to list sessions: ${resp.statusText}`);
    return resp.json();
  },

  /**
   * Upload a PDF file.
   */
  async uploadPdf(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const resp = await fetch(`${API_BASE}/upload/pdf`, {
      method: 'POST',
      body: formData,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Upload failed');
    }
    return resp.json();
  },

  /**
   * Health check.
   */
  async health() {
    const resp = await fetch(`${API_BASE}/health`);
    return resp.json();
  },

  async getResearchChat(sessionId: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/chat`);
    if (!resp.ok) throw new Error(`Failed to get chat: ${resp.statusText}`);
    return resp.json();
  },

  async sendResearchChat(sessionId: string, message: string) {
    const resp = await fetch(`${API_BASE}/research/${sessionId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || 'Failed to send chat');
    }
    return resp.json();
  },
};
