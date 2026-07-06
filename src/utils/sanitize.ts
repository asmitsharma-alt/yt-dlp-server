/**
 * Sanitizes a string for safe use as a filename.
 * Removes unsafe characters, collapses whitespace, trims, and truncates.
 */
export function sanitizeFilename(title: string): string {
  let sanitized = title
    // Remove any char that isn't alphanumeric, space, dash, underscore, or period
    .replace(/[^a-zA-Z0-9 \-_.]/g, '')
    // Collapse multiple spaces into one
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Truncate to 200 characters
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200).trim();
  }

  // Fallback if empty after sanitization
  if (sanitized.length === 0) {
    return 'download';
  }

  return sanitized;
}
