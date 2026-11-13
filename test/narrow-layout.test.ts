import { describe, expect, it } from 'vitest';
import * as sass from 'sass';

// jsdom does no layout, so the narrow-card rules cannot be measured here; what this pins is
// that they are in the stylesheet, scoped to the container they depend on. The end-to-end
// suite drives a real browser for anything that needs a box.
const css = sass.compile('src/styles/card.styles.scss').css;

describe('the narrow-card overrides', () => {
  it('make the card content a size container, so the rules answer to the width it was given', () => {
    expect(css).toMatch(/\.card-content\s*{[^}]*container:\s*nina-dwd-card\s*\/\s*inline-size/);
  });

  it('stack the DWD map above the warning text instead of floating it beside the headline', () => {
    const block = css.match(/@container nina-dwd-card \(max-width: 240px\)\s*{([\s\S]*?)\n}\s*$/)?.[1];

    expect(block).toMatch(/\.warning \.map-container\s*{[^}]*float:\s*none/);
    expect(block).toMatch(/min-width:\s*0/);
    expect(block).toMatch(/width:\s*100%/);
  });
});
