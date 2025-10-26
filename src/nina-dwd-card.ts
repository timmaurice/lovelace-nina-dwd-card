import { LitElement, html, TemplateResult, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { HomeAssistant, LovelaceCardEditor, NinaDwdCardConfig, NinaWarning, DwdWarning } from './types';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { fireEvent, formatTime } from './utils';
import { localize } from './localize';
import cardStyles from './styles/card.styles.scss';

const NINA_LEVEL_COLORS: Record<NinaWarning['severity'], string> = {
  Minor: '#ffeb3b',
  Moderate: '#fb8c00',
  Severe: '#e53935',
  Extreme: '#880e4f',
  Unknown: '#999999',
};

const DWD_LEVEL_COLORS: Record<number, string> = {
  0: '#c5e566' /* No Warning */,
  1: '#ffeb3b' /* Minor */,
  2: '#fb8c00' /* Moderate */,
  3: '#e53935' /* Severe */,
  4: '#880e4f' /* Extreme */,
};

@customElement('nina-dwd-card')
export class NinaDwdCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: NinaDwdCardConfig;
  @state() private _editMode = false;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    return document.createElement('nina-dwd-card-editor') as LovelaceCardEditor;
  }

  public static getStubConfig(): NinaDwdCardConfig {
    return {
      title: 'Warnings',
      type: 'custom:nina-dwd-card',
      nina_entity_prefix: '',
      max_warnings: 5,
      dwd_device: '',
    };
  }

  public setConfig(config: NinaDwdCardConfig): void {
    if (!config) {
      throw new Error('Invalid configuration');
    }
    if (!config.nina_entity_prefix && !config.dwd_device) {
      throw new Error('You need to define at least one NINA or DWD entity.');
    }

    this._config = {
      max_warnings: 5,
      ...config,
    };
  }

  /**
   * Called by Home Assistant when the card is in edit mode.
   * @param editMode True if the card is in edit mode.
   */
  public set editMode(editMode: boolean) {
    this._editMode = editMode;
    this.requestUpdate();
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    let ninaWarnings = this._getNinaWarnings();
    let dwdCurrentWarnings: DwdWarning[] = [];
    let dwdAdvanceWarnings: DwdWarning[] = [];

    if (this._config.dwd_device) {
      const deviceEntities = this._getDwdEntitiesFromDevice(this._config.dwd_device);
      if (deviceEntities.current) {
        dwdCurrentWarnings = this._getDwdWarnings(deviceEntities.current);
      }
      if (deviceEntities.advance) {
        dwdAdvanceWarnings = this._getDwdWarnings(deviceEntities.advance);
      }
    }

    // If there are active DWD warnings, filter out any NINA warnings that are from DWD.
    if (dwdCurrentWarnings.length > 0 || dwdAdvanceWarnings.length > 0) {
      ninaWarnings = ninaWarnings.filter((warning) => warning.sender !== 'Deutscher Wetterdienst');
    }

    const allWarningsRaw = [...ninaWarnings, ...dwdCurrentWarnings, ...dwdAdvanceWarnings];

    const deduplicatedWarnings = new Map<string, NinaWarning | DwdWarning>();
    const getWarningKey = (headline: string, start: string | undefined): string => {
      if (!start) {
        // Create a unique key for warnings without a start time to prevent them from being deduplicated
        return `${headline.toLowerCase().trim()}|${Math.random()}`;
      }
      try {
        const startDate = new Date(start);
        // Key is based on headline and start time (down to the hour)
        return `${headline.toLowerCase().trim()}|${startDate.toISOString().slice(0, 13)}`;
      } catch {
        return `${headline.toLowerCase().trim()}|invalid_date`;
      }
    };

    // Prioritize NINA warnings. If a DWD warning with the same key appears, it will be ignored.
    for (const warning of allWarningsRaw) {
      if (warning.headline && warning.start) {
        const key = getWarningKey(warning.headline, warning.start);
        if (!deduplicatedWarnings.has(key)) {
          deduplicatedWarnings.set(key, warning);
        }
      }
    }

    let mapUrl: string | undefined;
    if (this._config.dwd_map_land) {
      mapUrl = `https://www.dwd.de/DWD/warnungen/warnapp_gemeinden/json/warnungen_gemeinde_map_${this._config.dwd_map_land}.png`;
      // Add a timestamp to prevent caching issues
      mapUrl += `?${new Date().getTime()}`;
    }

    const allWarnings = Array.from(deduplicatedWarnings.values());

    let sortedWarnings = [...allWarnings].sort((a, b) => this._getSeverityScore(b) - this._getSeverityScore(a));

    if (this._config.max_warnings) {
      sortedWarnings = sortedWarnings.slice(0, this._config.max_warnings);
    }

    const editMode = this._editMode;
    const isHidden = allWarnings.length === 0 && this._config.hide_when_no_warnings;

    if (isHidden && !editMode) {
      return html``; // Hide card completely in view mode
    }

    const firstDwdIndex = sortedWarnings.findIndex((w) => 'level' in w);

    return html`
      <ha-card .header=${this._config.title} style=${isHidden && editMode ? 'opacity: 0.5;' : ''}>
        <div class="card-content">
          <div class="warnings-container">
            ${sortedWarnings.length === 0
              ? html`<div class="no-warnings" style="color: ${DWD_LEVEL_COLORS[0]}">No Warnings</div>`
              : sortedWarnings.map(
                  (warning, index) => html`
                    ${index > 0 ? html`<hr />` : ''}
                    <div class="warning">
                      ${'level' in warning && mapUrl && index === firstDwdIndex
                        ? html`<img class="map-image" src=${mapUrl} alt="DWD Warning Map" />`
                        : ''}
                      <div
                        class="headline"
                        style="color: ${'severity' in warning
                          ? NINA_LEVEL_COLORS[warning.severity]
                          : DWD_LEVEL_COLORS[warning.level] || '#999999'}"
                      >
                        <ha-icon icon="mdi:alert-circle-outline"></ha-icon> ${warning.headline}
                      </div>
                      <div class="time">${formatTime(warning, this.hass)}</div>
                      <div class="description">${unsafeHTML(warning.description)}</div>
                      ${'level' in warning && mapUrl ? html`<div class="clearfix"></div>` : ''}
                      ${isHidden && editMode
                        ? html`<div class="no-warnings">${localize(this.hass, 'card.hidden_in_view_mode')}</div>`
                        : !this._config.hide_instructions && 'instruction' in warning && warning.instruction
                          ? html`
                              <ha-expansion-panel outlined>
                                <div slot="header">${localize(this.hass, 'card.recommended_actions')}</div>
                                <div class="instruction">${warning.instruction}</div>
                              </ha-expansion-panel>
                            `
                          : ''}
                      ${!this._config.hide_footer
                        ? html`<div class="footer">
                            <div class="sender">
                              ${'sender' in warning && warning.sender
                                ? localize(this.hass, 'card.source', { sender: warning.sender })
                                : 'level' in warning
                                  ? localize(this.hass, 'card.source', { sender: 'Deutscher Wetterdienst' })
                                  : ''}
                            </div>
                            <ha-icon-button
                              class="info-button"
                              .label=${`More info for ${warning.headline}`}
                              @click=${() => this._handleMoreInfo(warning.entity_id)}
                              ><ha-icon icon="mdi:information-outline"></ha-icon
                            ></ha-icon-button>
                          </div>`
                        : ''}
                    </div>
                  `,
                )}
          </div>
        </div>
      </ha-card>
    `;
  }

  private _getNinaWarnings(): NinaWarning[] {
    const warnings: NinaWarning[] = [];
    if (!this._config.nina_entity_prefix) return warnings;

    // Check a fixed number of NINA entities. The total number of warnings is limited later.
    for (let i = 1; i <= 10; i++) {
      const entityId = `${this._config.nina_entity_prefix}_${i}`;
      const stateObj = this.hass.states[entityId];

      if (stateObj && stateObj.state === 'on') {
        warnings.push({
          headline: stateObj.attributes.headline,
          description: stateObj.attributes.description,
          sender: stateObj.attributes.sender,
          entity_id: entityId,
          severity: stateObj.attributes.severity,
          start: stateObj.attributes.start,
          expires: stateObj.attributes.expires,
          instruction: stateObj.attributes.instruction || stateObj.attributes.recommended_actions,
        });
      }
    }
    return warnings;
  }

  private _getDwdWarnings(entityId?: string): DwdWarning[] {
    const warnings: DwdWarning[] = [];
    if (!entityId) return warnings;

    const stateObj = this.hass.states[entityId];
    if (!stateObj || stateObj.state === '0') return warnings;

    // The state of the sensor indicates the number of active warnings.
    const count = parseInt(stateObj.state, 10) || 0;
    for (let i = 1; i <= count; i++) {
      warnings.push({
        headline: stateObj.attributes[`warning_${i}_headline`],
        description: stateObj.attributes[`warning_${i}_description`],
        entity_id: entityId,
        level: stateObj.attributes[`warning_${i}_level`],
        start: stateObj.attributes[`warning_${i}_start`],
        end: stateObj.attributes[`warning_${i}_end`],
        instruction: stateObj.attributes[`warning_${i}_instruction`],
      });
    }

    return warnings;
  }

  private _getDwdEntitiesFromDevice(deviceId: string): { current?: string; advance?: string } {
    const entities: { current?: string; advance?: string } = {};
    if (!deviceId) return entities;

    for (const entityId in this.hass.entities) {
      const entity = this.hass.entities[entityId];
      if (entity.device_id === deviceId) {
        if (entityId.endsWith('_aktuelle_warnstufe') || entityId.endsWith('_current_warning_level')) {
          entities.current = entityId;
        } else if (entityId.endsWith('_vorwarnstufe') || entityId.endsWith('_advance_warning_level')) {
          entities.advance = entityId;
        }
      }
    }

    return entities;
  }

  private _handleMoreInfo(entityId: string): void {
    fireEvent(this, 'hass-more-info', { entityId });
  }

  private _getSeverityScore(warning: NinaWarning | DwdWarning): number {
    if ('severity' in warning) {
      // NINA severity
      switch (warning.severity) {
        case 'Extreme':
          return 4;
        case 'Severe':
          return 3;
        case 'Moderate':
          return 2;
        case 'Minor':
          return 1;
        default:
          return 0; // 'Unknown'
      }
    }
    // DWD level
    return 'level' in warning ? warning.level : 0;
  }

  static styles = css`
    ${unsafeCSS(cardStyles)}
  `;
}

declare global {
  interface Window {
    customCards: Array<unknown>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'nina-dwd-card',
  name: 'NINA and DWD Warnings Card',
  preview: true,
  description: 'A card to display warnings from NINA and DWD.',
});
