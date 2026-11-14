import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Style files are mocked in vitest, so the narrow-container rule is checked in
// the source: below 240px the headline must hyphenate instead of breaking mid-word.
describe('narrow card headline', () => {
  const scss = readFileSync('src/styles/card.styles.scss', 'utf8');
  const start = scss.indexOf('@container nina-dwd-card (max-width: 240px)');

  it('hyphenates and shrinks the headline in the narrowest container tier', () => {
    expect(start).toBeGreaterThan(-1);
    const block = scss.slice(start);
    const rule = block.match(/\.headline\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('hyphens: auto');
    expect(rule![1]).toMatch(/font-size:\s*0\.\d+em/);
    expect(rule![1]).toContain('overflow-wrap: break-word');
  });
});
