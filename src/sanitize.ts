/**
 * Content sanitization to prevent prompt injection and token leakage.
 * Borrowed from claude-code-action patterns.
 */

/** Remove zero-width and invisible Unicode characters used for hidden text injection. */
export function stripInvisibleUnicode(text: string): string {
  return text.replace(
    // Zero-width chars, word joiners, direction overrides, invisible separators
    /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u202A\u202B\u202C\u202D\u202E\u00AD\u034F\u061C\u180E]/g,
    "",
  );
}

/** Remove HTML comments which can hide prompt injection instructions. */
export function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Neutralize markdown image alt text injection.
 * Attackers hide instructions in alt text: ![do something malicious](url)
 * We keep the image link but strip the alt text.
 */
export function stripImageAltInjection(text: string): string {
  return text.replace(/!\[[^\]]{50,}\]\(/g, "![](");
}

/** Redact GitHub tokens that may appear in content. */
export function redactTokens(text: string): string {
  return text.replace(
    /\b(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,221})\b/g,
    "[REDACTED]",
  );
}

/** Apply all sanitization functions to user-provided text. */
export function sanitize(text: string): string {
  if (!text) return text;
  return redactTokens(stripHtmlComments(stripInvisibleUnicode(stripImageAltInjection(text))));
}
