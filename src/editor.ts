import { LitElement, html, TemplateResult, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCardEditor, NinaDwdCardConfig } from './types';
import { localize, translations } from './localize';
import { fireEvent } from './utils';
import editorStyles from './styles/editor.styles.scss';

const SCHEMA = [
  {
    name: 'nina_entity_count',
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

    const ninaPrefixes: { label: string; value: string }[] = [
      ...new Set(
        Object.keys(this.hass.states)
          .filter((eid) => {
            const stateObj = this.hass.states[eid];
            // Check for a unique attribute like 'sender' to identify NINA entities reliably.
            return eid.startsWith('binary_sensor.') && stateObj?.attributes.sender && eid.endsWith('_1');
          })
          .map((eid) => {
            const prefix = eid.replace(/_\d+$/, '');
            const friendlyName = this.hass.states[eid]?.attributes.friendly_name || prefix;
            const label = friendlyName.replace(/(?:\sWarning)?\s*\d*$/, '').trim();
            return { label, value: prefix };
          }),
      ),
    ];

    const lang = this.hass.language || 'en';
    const langOptions = translations[lang]?.editor.dwd_map_land_options || translations.en.editor.dwd_map_land_options;

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
        </div>
      </ha-card>
    `;
  }

  private _titleChanged(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    this._config = { ...this._config, title: target.value };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  private _ninaPrefixChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const target = ev.target as HTMLSelectElement;
    const newConfig = { ...this._config };
    if (target.value) {
      newConfig.nina_entity_prefix = target.value;
    } else {
      delete newConfig.nina_entity_prefix;
    }
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  static styles = css`
    ${unsafeCSS(editorStyles)}
  `;
}
