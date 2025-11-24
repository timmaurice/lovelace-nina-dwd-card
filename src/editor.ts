import { LitElement, html, TemplateResult, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCardEditor, NinaDwdCardConfig, TranslationObject } from './types';
import { localize, translations } from './localize';
import { fireEvent } from './utils';
import editorStyles from './styles/editor.styles.scss';

// Schema organized into logical sections
const SCHEMA = [
  {
    name: 'dwd_device',
    selector: {
      device: {
        integration: 'dwd_weather_warnings',
      },
    },
  },
  // DWD Map Settings
  {
    type: 'expandable',
    title: 'groups.dwd_map',
    schema: [
      {
        name: 'dwd_map_type',
        selector: { select: { mode: 'dropdown' } },
      },
      {
        name: 'dwd_map_land',
        selector: { select: { mode: 'dropdown' } },
      },
      {
        name: 'map_pin_zone',
        selector: { entity: { domain: 'zone' } },
      },
      {
        name: 'dwd_map_position',
        selector: { select: { mode: 'dropdown' } },
      },
    ],
  },
  // Display Options
  {
    type: 'expandable',
    title: 'groups.display_options',
    schema: [
      {
        name: 'max_warnings',
        selector: {
          number: {
            min: 1,
            max: 20,
            step: 1,
            mode: 'box',
          },
        },
      },
      {
        name: 'hide_on_level_below',
        selector: { select: { mode: 'dropdown' } },
      },
      {
        name: 'hide_instructions',
        selector: { boolean: {} },
      },
      {
        name: 'hide_footer',
        selector: { boolean: {} },
      },
      {
        name: 'separate_advance_warnings',
        selector: { boolean: {} },
      },
      {
        name: 'hide_when_no_warnings',
        selector: { boolean: {} },
      },
    ],
  },
  // Theme
  {
    type: 'expandable',
    title: 'groups.theme',
    schema: [
      {
        name: 'theme_mode',
        selector: { select: { mode: 'dropdown' } },
      },
    ],
  },
  // AI Translation
  {
    type: 'expandable',
    title: 'groups.translation',
    schema: [
      { name: 'enable_translation', selector: { boolean: {} } },
      {
        name: 'translation_target',
        selector: { select: { mode: 'dropdown' } },
      },
      {
        name: 'ai_entity_id',
        selector: { entity: { domain: 'ai_task' } },
      },
    ],
  },
];

@customElement('nina-dwd-card-editor')
export class NinaDwdCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: NinaDwdCardConfig;

  public setConfig(config: NinaDwdCardConfig): void {
    this._config = config;
  }

  private _colorOverrideChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement & { configValue: string };
    const level = target.configValue as keyof NonNullable<NinaDwdCardConfig['color_overrides']>;
    const value = target.value;

    let newConfig: NinaDwdCardConfig = {
      ...this._config,
      color_overrides: {
        ...this._config.color_overrides,
        [level]: value,
      },
    };
    // Clean up empty values
    if (!value) {
      delete newConfig.color_overrides?.[level];
      if (Object.keys(newConfig.color_overrides || {}).length === 0) {
        // Create a new object without the empty color_overrides
        const { color_overrides, ...rest } = newConfig; // eslint-disable-line @typescript-eslint/no-unused-vars
        newConfig = rest;
      }
    }
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _valueChanged(ev: { detail: { value: Partial<NinaDwdCardConfig> } }): void {
    if (!this.hass || !this._config) return;
    const changedValue = ev.detail.value;
    const newConfig = { ...this._config, ...changedValue } as NinaDwdCardConfig;

    // If dwd_device is being cleared, also remove the map setting.
    if ('dwd_device' in changedValue && !newConfig.dwd_device) {
      delete newConfig.dwd_map_type;
      delete newConfig.dwd_map_land;
      delete newConfig.dwd_map_position;
    }

    // If a dwd_device is newly selected, set default map options.
    if ('dwd_device' in changedValue && newConfig.dwd_device && !this._config.dwd_device) {
      newConfig.dwd_map_type = 'state';
      newConfig.dwd_map_land = 'de';
    }

    // If dwd_map_type changed, reset dwd_map_land to the default for that type.
    // This must come after the other logic to avoid being overridden.
    if (
      'dwd_map_type' in changedValue &&
      newConfig.dwd_map_type &&
      newConfig.dwd_map_type !== this._config.dwd_map_type
    ) {
      newConfig.dwd_map_land = newConfig.dwd_map_type === 'region' ? 'SchilderD' : 'de'; // 'SchilderD' is Germany for region
    }

    fireEvent(this, 'config-changed', { config: newConfig });
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) {
      return html``;
    }

    const ninaPrefixesMap = new Map<string, { label: string; value: string }>();
    Object.keys(this.hass.states)
      .filter((eid) => {
        const entity = this.hass.entities[eid];
        // Filter for entities from the 'nina' integration.
        // This is more reliable than checking attributes.
        return entity?.platform === 'nina';
      })
      .forEach((eid) => {
        const prefix = eid.replace(/_\d+$/, '');
        if (!ninaPrefixesMap.has(prefix)) {
          const friendlyName = this.hass.states[eid]?.attributes.friendly_name || prefix;
          const label = friendlyName.replace(/(?:\sWarning)?\s*\d*$/, '').trim();
          ninaPrefixesMap.set(prefix, { label, value: prefix });
        }
      });
    const ninaPrefixes = Array.from(ninaPrefixesMap.values());

    const lang = this.hass.language || 'en';
    const mapType = this._config.dwd_map_type || 'state';
    const langOptionsKey = mapType === 'region' ? 'dwd_map_region_options' : 'dwd_map_land_options';

    const getLangOptions = (lang: string, key: string): Record<string, string> => {
      const langTranslations = translations[lang as keyof typeof translations] as unknown as TranslationObject;
      if (!langTranslations) return {};

      return ((langTranslations.editor as TranslationObject)[key] as Record<string, string>) || {};
    };
    const langOptions = getLangOptions(lang, langOptionsKey) || getLangOptions('en', langOptionsKey);

    const hideLevelOptions = [
      {
        value: '2',
        label: `2 / ${localize(this.hass, 'component.nina-dwd-card.editor.hide_on_level_below_options.moderate')}`,
      },
      {
        value: '3',
        label: `3 / ${localize(this.hass, 'component.nina-dwd-card.editor.hide_on_level_below_options.severe')}`,
      },
    ];

    // Helper function to process schema items recursively
    const processSchemaItem = (item: Record<string, unknown>): Record<string, unknown> => {
      // Handle expandable sections
      if (item.type === 'expandable' && Array.isArray(item.schema)) {
        return {
          ...item,
          title: typeof item.title === 'string' ? localize(this.hass, `editor.${item.title}`) : item.title,
          schema: (item.schema as Record<string, unknown>[]).map(processSchemaItem),
        };
      }

      // Handle regular items
      if (item.name === 'dwd_map_land') {
        // The options for dwd_map_land depend on dwd_map_type
        return {
          ...item,
          selector: {
            select: {
              mode: 'dropdown',
              clearable: true,
              options: Object.keys(langOptions)
                .filter((key) => key !== 'none')
                .map((key) => ({
                  value: key,
                  label: langOptions[key],
                })),
            },
          },
        };
      }
      if (item.name === 'dwd_map_type') {
        return {
          ...item,
          selector: {
            select: {
              mode: 'dropdown',
              clearable: false,
              options: ['state', 'region'].map((key) => ({
                value: key,
                label: localize(this.hass, `editor.dwd_map_type_options.${key}`),
              })),
            },
          },
        };
      }
      if (item.name === 'dwd_map_position') {
        return {
          ...item,
          selector: {
            select: {
              mode: 'dropdown',
              options: ['inside', 'above', 'below', 'none'].map((key) => ({
                value: key,
                label: localize(this.hass, `editor.dwd_map_position_options.${key}`),
              })),
            },
          },
        };
      }
      if (item.name === 'hide_on_level_below') {
        return {
          ...item,
          selector: {
            select: {
              mode: 'dropdown',
              options: hideLevelOptions,
            },
          },
        };
      }
      if (item.name === 'theme_mode') {
        return {
          ...item,
          selector: {
            select: {
              mode: 'dropdown',
              options: ['auto', 'light', 'dark'].map((key) => ({
                value: key,
                label: localize(this.hass, `editor.theme_mode_options.${key}`),
              })),
            },
          },
        };
      }
      if (item.name === 'translation_target') {
        return {
          ...item,
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'English', label: 'English' },
                { value: 'Swiss German', label: 'Schwiizerdütsch (Swiss German)' },
                { value: 'Bavarian', label: 'Bairisch (Bavarian)' },
                { value: 'Austrian German', label: 'Österreichisches Deutsch (Austrian German)' },
                { value: 'Swabian', label: 'Schwäbisch (Swabian)' },
                { value: 'Low German', label: 'Plattdütsch (Low German)' },
                { value: 'Kölsch', label: 'Kölsch (Cologne Dialect)' },
                { value: 'Wäller Platt', label: 'Wäller Platt (Westerwald Dialect)' },
                { value: 'French', label: 'Français (French)' },
                { value: 'Spanish', label: 'Español (Spanish)' },
                { value: 'Italian', label: 'Italiano (Italian)' },
                { value: 'Dutch', label: 'Nederlands (Dutch)' },
                { value: 'Polish', label: 'Polski (Polish)' },
                { value: 'Czech', label: 'Čeština (Czech)' },
                { value: 'Danish', label: 'Dansk (Danish)' },
              ],
            },
          },
        };
      }
      return item;
    };

    // Helper function to filter schema items recursively
    const filterSchemaItem = (item: Record<string, unknown>): boolean => {
      // Handle expandable sections
      if (item.type === 'expandable' && Array.isArray(item.schema)) {
        // Filter the nested schema
        const filteredSchema = (item.schema as Record<string, unknown>[]).filter(filterSchemaItem);
        item.schema = filteredSchema;
        // Keep the section if it has any items left
        return filteredSchema.length > 0;
      }

      // Handle regular items - only show map_pin_zone if map type is 'state'
      if (item.name === 'map_pin_zone') {
        return this._config.dwd_map_type === 'state';
      }

      return true;
    };

    // Filter and process schema
    const filteredSchema = SCHEMA.filter(filterSchemaItem);
    const schema = filteredSchema.map(processSchemaItem);

    return html`
      <ha-card>
        <div class="card-content card-config">
          <div class="group">
            <div class="group-header">${localize(this.hass, 'component.nina-dwd-card.editor.groups.core')}</div>
            <ha-textfield
              .label=${localize(this.hass, 'component.nina-dwd-card.editor.title')}
              .value=${this._config.title || ''}
              .configValue=${'title'}
              @input=${this._titleChanged}
            ></ha-textfield>
            <ha-select
              .label=${localize(this.hass, 'component.nina-dwd-card.editor.nina_entity_prefix')}
              .value=${this._config.nina_entity_prefix || ''}
              .configValue=${'nina_entity_prefix'}
              @selected=${this._ninaPrefixChanged}
              @closed=${(ev: Event) => ev.stopPropagation()}
              clearable
              fixedMenuPosition
              naturalMenuWidth
            >
              ${ninaPrefixes.map((item) => html`<mwc-list-item .value=${item.value}>${item.label}</mwc-list-item>`)}
            </ha-select>
            <ha-form
              .schema=${schema}
              .hass=${this.hass}
              .data=${this._config}
              .computeLabel=${(s: { name: string }) => localize(this.hass, `component.nina-dwd-card.editor.${s.name}`)}
              @value-changed=${this._valueChanged}
            ></ha-form>
          </div>
          <div class="color-overrides-section">
            <div class="section-header">${localize(this.hass, 'component.nina-dwd-card.editor.theme.color_overrides')}</div>
            <div class="color-grid">
              <ha-textfield
                .label=${localize(this.hass, 'component.nina-dwd-card.editor.color_overrides.no_warning')}
                .value=${this._config.color_overrides?.no_warning || ''}
                .configValue=${'no_warning'}
                @change=${this._colorOverrideChanged}
                placeholder="#c5e566"
              ></ha-textfield>
              <ha-textfield
                .label=${localize(this.hass, 'component.nina-dwd-card.editor.color_overrides.minor')}
                .value=${this._config.color_overrides?.minor || ''}
                .configValue=${'minor'}
                @change=${this._colorOverrideChanged}
                placeholder="#ffeb3b"
              ></ha-textfield>
              <ha-textfield
                .label=${localize(this.hass, 'component.nina-dwd-card.editor.color_overrides.moderate')}
                .value=${this._config.color_overrides?.moderate || ''}
                .configValue=${'moderate'}
                @change=${this._colorOverrideChanged}
                placeholder="#fb8c00"
              ></ha-textfield>
              <ha-textfield
                .label=${localize(this.hass, 'component.nina-dwd-card.editor.color_overrides.severe')}
                .value=${this._config.color_overrides?.severe || ''}
                .configValue=${'severe'}
                @change=${this._colorOverrideChanged}
                placeholder="#e53935"
              ></ha-textfield>
              <ha-textfield
                .label=${localize(this.hass, 'component.nina-dwd-card.editor.color_overrides.extreme')}
                .value=${this._config.color_overrides?.extreme || ''}
                .configValue=${'extreme'}
                @change=${this._colorOverrideChanged}
                placeholder="#880e4f"
              ></ha-textfield>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _ninaPrefixChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const target = ev.target as HTMLSelectElement;
    this._valueChanged({ detail: { value: { nina_entity_prefix: target.value || undefined } } });
  }

  private _titleChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    this._config = { ...this._config, title: target.value };
    fireEvent(this, 'config-changed', {
      config: this._config,
    });
  }

  static styles = css`
    ${unsafeCSS(editorStyles)}
  `;
}
