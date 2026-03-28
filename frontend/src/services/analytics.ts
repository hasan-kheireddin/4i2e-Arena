import { getAccessToken } from './api';

const ANALYTICS_BASE = '/api/analytics';

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ExportFormat = 'json' | 'csv' | 'xml';

/**
 * Download the user's activity export as a file.
 * Triggers a browser file-save dialog.
 */
export async function exportActivityData(format: ExportFormat = 'json'): Promise<void> {
  const res = await fetch(`${ANALYTICS_BASE}/activity/export/?format=${format}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  }

  const blob = await res.blob();
  const contentDisposition = res.headers.get('Content-Disposition') ?? '';
  const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
  const filename = filenameMatch ? filenameMatch[1] : `activity_export.${format}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Upload a previously exported activity file (JSON, CSV, or XML).
 * The server will skip events that already exist (idempotent).
 */
export async function importActivityData(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${ANALYTICS_BASE}/activity/import/`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.detail ?? `Import failed: ${res.status}`);
  }

  return data as ImportResult;
}
