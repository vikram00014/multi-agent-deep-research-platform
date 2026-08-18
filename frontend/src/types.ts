/* Types for the Delve frontend */

export interface WSMessage {
  type: 'connected' | 'status' | 'paper_found' | 'gap' | 'debate' | 'complete' | 'error' | 'heartbeat' | 'pong';
  message?: string;
  data?: Record<string, unknown>;
}

export interface ResearchGap {
  title: string;
  evidence: string;
  proposed_direction: string;
  why_gap?: string;
  what_missing?: string;
  supports?: string[];
  fails?: string[];
}

export interface FeedItem {
  id: string;
  timestamp: Date;
  type: WSMessage['type'];
  message: string;
  data?: Record<string, unknown>;
  node?: string;
}

export interface Session {
  session_id: string;
  topic: string;
  status: string;
  current_step?: string;
  updated_at?: string;
  token_estimate?: number;
  cost_estimate_usd?: number;
}

export interface UploadResponse {
  file_id: string;
  filename: string;
  chunks_stored: number;
  total_characters: number;
}

export interface PaperResult {
  session_id: string;
  paper: string;
  analysis?: string;
  final_draft?: string;
  gaps: ResearchGap[];
  bibliography: Array<Record<string, string>>;
  debate_log: string[];
  timeline?: Array<Record<string, unknown>>;
  citation_quality?: Record<string, { source_quality: number; confidence: number }>;
  citation_verification?: Record<string, { title_ok: boolean; year_ok: boolean; doi_ok: boolean; verified: boolean }>;
  claim_to_evidence_map?: Array<Record<string, unknown>>;
  source_counts?: Record<string, number>;
  duplicate_clusters?: Array<Record<string, unknown>>;
  debate_rounds?: number;
  verified_citations?: number;
  paper_format?: string;
  format_compliance?: {
    paper_format?: string;
    checks?: Record<string, boolean>;
    passed?: number;
    total?: number;
    score?: number;
    is_compliant?: boolean;
  };
  cross_paper_analysis?: Record<string, unknown>;
  gap_candidates?: Array<Record<string, unknown>>;
  gap_critique?: string;
}

export interface SessionDetail {
  session_id: string;
  topic: string;
  status: string;
  current_step: string;
  started_at?: string;
  finished_at?: string | null;
  elapsed_seconds?: number;
  source_counts?: Record<string, number>;
  duplicate_clusters?: Array<Record<string, unknown>>;
  error?: string | null;
  token_estimate?: number;
  cost_estimate_usd?: number;
  controls?: Record<string, unknown>;
  uploaded_paper_ids?: string[];
  resource_files?: Array<{
    name: string;
    size_bytes: number;
    updated_at: string;
  }>;
}

export interface UserQuota {
  papers_generated: number;
  papers_allowed: number;
  papers_remaining: number;
  last_paper_at: string | null;
  has_quota: boolean;
}

