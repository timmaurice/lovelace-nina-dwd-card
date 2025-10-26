import { LitElement, html, TemplateResult, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCardEditor, NinaDwdCardConfig } from './types';
import { localize, translations } from './localize';
import { fireEvent } from './utils';
import editorStyles from './styles/editor.styles.scss';

// `separate_advance_warnings` is missing from the schema, I'll add it.
const SCHEMA = [
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
    name: 'dwd_device',
    selector: {
      device: {
        integration: 'dwd_weather_warnings',
      },
    },
  },
  {
    name: 'dwd_map_land',
    selector: { select: { mode: 'dropdown' } },
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
    const newConfig = { ...this._config, ...ev.detail.value } as NinaDwdCardConfig;

    // If dwd_device is being cleared, also remove the map setting.
    if (!newConfig.dwd_device) {
      delete newConfig.dwd_map_land;
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
    const langOptions = translations[lang]?.editor.dwd_map_land_options || translations.en.editor.dwd_map_land_options;

    const hideLevelOptions = [
      {
        value: 2,
        label: `2 / ${localize(this.hass, 'component.nina-dwd-card.editor.hide_on_level_below_options.moderate')}`,
      },
      {
        value: 3,
        label: `3 / ${localize(this.hass, 'component.nina-dwd-card.editor.hide_on_level_below_options.severe')}`,
      },
    ];

    // Filter schema based on current config
    let filteredSchema = [...SCHEMA];
    if (!this._config.dwd_device) {
      filteredSchema = filteredSchema.filter((item) => item.name !== 'dwd_map_land');
    }
    // Dynamically build the schema for the form to include translatable dropdown options.
    const schema = filteredSchema.map((item) => {
      if (item.name === 'dwd_map_land') {
        return {
          ...item,
          selector: {
            select: {
              mode: 'dropdown',
              options: Object.keys(langOptions).map((key) => ({
                value: key === 'none' ? '' : key,
                label: localize(this.hass, `component.nina-dwd-card.editor.dwd_map_land_options.${key}`),
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
              clearable: true,
            },
          },
        };
      }
      return item;
    });

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
          <ha-expansion-panel .header=${localize(this.hass, 'component.nina-dwd-card.editor.groups.color_overrides')}>
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
          </ha-expansion-panel>
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
    fireEvent(this, 'config-changed', { config: this._config });
  }

  static styles = css`
    ${unsafeCSS(editorStyles)}
  `;
}
