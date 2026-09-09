import { describe, expect, it } from 'vitest';
import { isSafeUrl, sanitizeHtml } from '../src/sanitize';

describe('sanitizeHtml', () => {
  it('keeps allow-listed markup', () => {
    const result = sanitizeHtml('<p>Hello <strong>world</strong><br />again</p><ul><li>one</li></ul>');
    expect(result).toBe('<p>Hello <strong>world</strong><br>again</p><ul><li>one</li></ul>');
  });

  it('strips event handler attributes', () => {
    const result = sanitizeHtml('<img src="https://example.com/a.png" onerror="window.__xss = 1">');
    expect(result).toBe('<img src="https://example.com/a.png">');
    expect(result).not.toContain('onerror');
  });

  it('removes script and iframe subtrees', () => {
    const result = sanitizeHtml('<p>ok</p><script>window.__xss = 1;</script><iframe src="https://evil.test"></iframe>');
    expect(result).toBe('<p>ok</p>');
  });

  it('drops javascript: links but keeps their text', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).toBe('<a>click</a>');
  });

  it('keeps http links and forces a safe target', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>');
  });

  it('removes style attributes and unknown tags while keeping text', () => {
    const result = sanitizeHtml('<custom-el style="position:fixed">text</custom-el>');
    expect(result).toBe('text');
  });

  it('drops images with an unsafe source', () => {
    expect(sanitizeHtml('<img src="javascript:alert(1)">')).toBe('');
    expect(sanitizeHtml('<img src="data:text/html,<script>1</script>">')).toBe('');
  });

  it('repairs markup that was cut mid-tag', () => {
    const result = sanitizeHtml('<p>Text that was truncated <a href="https://example.com">mid');
    expect(result).toContain('Text that was truncated');
    expect(result).not.toContain('<a href="https://example.com">mid<');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('isSafeUrl', () => {
  it('accepts web and contact links', () => {
    expect(isSafeUrl('https://example.com/feed')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('mailto:someone@example.com')).toBe(true);
    expect(isSafeUrl('/local/image.png')).toBe(true);
  });

  it('rejects script and unknown schemes', () => {
    expect(isSafeUrl('javascript:window.__xss = 1')).toBe(false);
    expect(isSafeUrl('  javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>1</script>')).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
  });

  it('accepts base64 image data URLs only when images are allowed', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    expect(isSafeUrl(url, true)).toBe(true);
    expect(isSafeUrl(url)).toBe(false);
    expect(isSafeUrl('data:image/svg+xml;base64,PHN2Zz4=', true)).toBe(false);
  });
});
