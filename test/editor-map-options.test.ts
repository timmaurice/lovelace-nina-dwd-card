import { describe, expect, it } from 'vitest';
import '../src/editor';

type SelectItem = { name: string; selector?: { select?: { options: { value: string }[] } } };

const findMapOptions = (schema: Record<string, unknown>[], name: string): { value: string }[] | undefined => {
  for (const item of schema as unknown as (SelectItem & { schema?: Record<string, unknown>[] })[]) {
    if (item.name === name) return item.selector?.select?.options;
    if (Array.isArray(item.schema)) {
      const found = findMapOptions(item.schema, name);
      if (found) return found;
    }
  }
  return undefined;
};

const renderOptions = async (language: string): Promise<{ value: string }[] | undefined> => {
  const editor = document.createElement('nina-dwd-card-editor') as HTMLElement & {
    hass: unknown;
    setConfig: (c: unknown) => void;
    updateComplete: Promise<boolean>;
    shadowRoot: ShadowRoot;
  };
  editor.hass = { language, states: {}, entities: {}, localize: () => '' };
  editor.setConfig({ type: 'custom:nina-dwd-card', dwd_map_type: 'state', dwd_map_land: 'de' });
  document.body.appendChild(editor);
  await editor.updateComplete;
  const form = editor.shadowRoot.querySelector('ha-form') as unknown as { schema: Record<string, unknown>[] };
  const options = findMapOptions(form.schema, 'dwd_map_land');
  editor.remove();
  return options;
};

describe('Editor DWD map options', () => {
  it('lists the map options for a language without its own translation', async () => {
    const fr = await renderOptions('fr');
    const en = await renderOptions('en');
    expect(en?.length).toBeGreaterThan(0);
    expect(fr).toEqual(en);
  });
});
