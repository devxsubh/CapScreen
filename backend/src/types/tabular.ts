/** Tabular review column config (shared with frontend shape). */
export interface ColumnConfig {
  index: number;
  name: string;
  prompt: string;
  format?: string;
  tags?: string[];
}

export interface TabularRowDoc {
  id: string;
  name: string;
  user_id: string;
  project_id: string | null;
  folder_id: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}
