import { describe, expect, it, vi } from 'vitest';

// A duplicate Lovelace resource entry evaluates the bundle twice in the same
// window. Each evaluation brings its own class, and the element registry
// throws on a second `define` of a tag - which used to take the second copy
// down with an uncaught NotSupportedError.
describe('Element registration', () => {
  it('survives the bundle being evaluated twice', async () => {
    await import('../src/nina-dwd-card');
    await import('../src/editor');
    const card = customElements.get('nina-dwd-card');
    const editor = customElements.get('nina-dwd-card-editor');
    expect(card).toBeDefined();
    expect(editor).toBeDefined();

    vi.resetModules();
    await expect(import('../src/nina-dwd-card')).resolves.toBeDefined();
    await expect(import('../src/editor')).resolves.toBeDefined();

    // The first registration stays; the second copy does not replace it.
    expect(customElements.get('nina-dwd-card')).toBe(card);
    expect(customElements.get('nina-dwd-card-editor')).toBe(editor);
  });

  it('lists the card in the picker only once when evaluated twice', async () => {
    const entries = () =>
      (window.customCards as Array<{ type: string }>).filter((card) => card.type === 'nina-dwd-card');

    await import('../src/nina-dwd-card');
    expect(entries()).toHaveLength(1);

    vi.resetModules();
    await import('../src/nina-dwd-card');
    expect(entries()).toHaveLength(1);
  });
});
