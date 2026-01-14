// PAI Slack Bot Integration - Type Definitions
// TypeScript interfaces for Slack integration

export interface SlackMessage {
  channel: string;
  text: string;
  thread_ts?: string;
  user?: string;
}

export interface SlackThreadMessage {
  type: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  bot_id?: string;
}

export interface SlackMentionEvent {
  type: "app_mention";
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  event_ts: string;
}

export interface ThreadContext {
  messages: SlackThreadMessage[];
  channel: string;
  thread_ts: string;
}

export interface BotRequest {
  prompt: string;
  context?: ThreadContext;
  user?: string;
}

export interface BotResponse {
  text: string;
  error?: string;
}

export interface SendMessageRequest {
  channel: string;
  text: string;
  thread_ts?: string;
}

export interface HealthResponse {
  status: "healthy" | "unhealthy";
  port: number;
  socket_mode: boolean;
  bot_token_configured: boolean;
  app_token_configured: boolean;
  active_sessions?: number;
}

// Memory Extraction Types

export type MemoryType = "goal" | "fact" | "challenge" | "idea" | "project" | "preference";

export type MemoryCategory =
  | "health"
  | "work"
  | "family"
  | "learning"
  | "finance"
  | "relationships"
  | "spirituality"
  | "routine"
  | "technical"
  | "general";

export interface MemoryExtraction {
  type: MemoryType;
  content: string;
  category?: MemoryCategory;
  confidence: number;
  raw: string;
  subject?: string;
  syncToTelos: boolean;
}

export interface ExtractionResult {
  extractions: MemoryExtraction[];
  needsConfirmation: MemoryExtraction[];
}

export interface StoredMemory {
  id: string;
  type: MemoryType;
  content: string;
  category: MemoryCategory;
  source: string;
  channel: string;
  userId: string;
  date: string;
  confidence: number;
  syncedToTelos: boolean;
  telosSyncDate?: string;
}

export interface MemoryStore {
  goals: StoredMemory[];
  facts: StoredMemory[];
  challenges: StoredMemory[];
  ideas: StoredMemory[];
  projects: StoredMemory[];
}

// Channel Configuration Types

export type ChannelType = "personal" | "project" | "team";

export interface ChannelConfig {
  id: string;
  name: string;
  type: ChannelType;
  description: string;
  memoryEnabled: boolean;
  syncToTelos: boolean;
  contextInjection: boolean;
  created: string;
  participants: string[];
}

export interface ChannelIndex {
  channels: Record<string, { name: string; type: ChannelType; configured: boolean }>;
  lastUpdated: string;
}

// Onboarding Types

export interface OnboardingState {
  channelId: string;
  step: number;
  answers: Partial<ChannelConfig>;
  startedAt: string;
}

export interface OnboardingResult {
  message: string;
  complete: boolean;
  config?: ChannelConfig;
}

// User Profile Types

export interface ProfileInteraction {
  date: string;
  channel: string;
  topic: string;
}

export interface UserProfile {
  id: string;
  name: string;
  displayName?: string;
  role: "owner" | "participant";
  firstSeen: string;
  updated: string;
  primaryChannel: string;
  notes: string[];
  preferences: Record<string, string>;
  interactionCount: number;
  recentInteractions: ProfileInteraction[];
}

// Context Builder Types

export interface ContextData {
  profile?: { name: string; notes: string[] };
  goals?: string[];
  channelContext?: string[];
  recentMemories?: string[];
}

// TELOS Bridge Types

export interface TELOSSyncConfig {
  enabled: boolean;
  autoSync: boolean;
  telosDir: string;
}

export interface TELOSSyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

// Progress Tracking Types

export interface ActiveProgress {
  channel: string;
  thread_ts: string;
  message_ts: string;
  startedAt: number;
  lastUpdate: number;
}

export interface ProgressStartRequest {
  channel: string;
  thread_ts: string;
  text?: string;
}

export interface ProgressUpdateRequest {
  text: string;
  channel?: string;
  thread_ts?: string;
}

export interface ProgressResponse {
  ok: boolean;
  message_ts?: string;
  error?: string;
}

// File Attachment Types

export interface FileAttachment {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  filetype: string;
  url_private: string;
  url_private_download: string;
  permalink: string;
  title?: string;
}

export interface ReceivedFile {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  localPath: string;
  channel: string;
  thread_ts?: string;
  uploadedBy: string;
  receivedAt: string;
}

export interface FileUploadRequest {
  channel: string;
  thread_ts?: string;
  file_path: string;
  filename?: string;
  title?: string;
  initial_comment?: string;
}

export interface FileUploadResponse {
  ok: boolean;
  file_id?: string;
  permalink?: string;
  error?: string;
}

export interface FileListResponse {
  ok: boolean;
  files: ReceivedFile[];
  error?: string;
}
