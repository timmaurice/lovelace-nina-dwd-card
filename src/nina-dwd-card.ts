import { LitElement, html, TemplateResult, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  HomeAssistant,
  LovelaceCardEditor,
  LovelaceGridOptions,
  NinaDwdCardConfig,
  NinaWarning,
  DwdWarning,
} from './types';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import {
  asOptionalString,
  fireEvent,
  formatTime,
  getNinaAreaName,
  getWarningEndTime,
  getWarningHeadline,
  isHeadlineHidden,
  isWarningExpired,
  shortenNinaAreaName,
  stripWarningPrefix,
} from './utils';
import { localize } from './localize';
import { sanitizeHtml } from './sanitize';
import { MAP_DATA, MapData } from './map-data';
import cardStyles from './styles/card.styles.scss';
import { EVENT_CODE_ICONS } from './icons';
import { TranslationCache } from './translation-cache';

const SEVERITY_COLORS: Record<number, string> = {
  0: '#c5e566' /* No Warning */,
  1: '#ffeb3b' /* Minor */,
  2: '#fb8c00' /* Moderate */,
  3: '#e53935' /* Severe */,
  4: '#880e4f' /* Extreme */,
};

/** Number of warning slots probed per NINA prefix and per DWD sensor. */
const MAX_WARNING_SLOTS = 20;

/** Grid rows a single rendered warning takes up, used by `getCardSize`. */
const CARD_SIZE_PER_WARNING = 3;

/** Grid rows a standalone map takes up, used by `getCardSize`. */
const CARD_SIZE_MAP = 4;

/** Upper bound for the expiry re-render timer (six hours). */
const MAX_EXPIRY_TIMER_MS = 6 * 60 * 60 * 1000;

const DEFAULT_AI_PROMPT = `Translate the following warning details to {{ target_language }}. Return ONLY a JSON object with keys: headline, description, instruction (if present). 
Headline: {{ headline }} Description: {{ description }} Instruction: {{ instruction }}`;

@customElement('nina-dwd-card')
export class NinaDwdCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: NinaDwdCardConfig;
  @state() private _editMode = false;
  @state() private _warnings: (NinaWarning | DwdWarning)[] = [];
  @state() private _showLargeMap = false;
  @state() private _translations: Record<string, { headline: string; description: string; instruction: string }> = {};
  @state() private _expandedWarnings: Set<string> = new Set();
  private _translationInProgress = new Set<string>();
  private _error: string | undefined;
  private _cache = new TranslationCache();
  private _hasLoggedTranslationWarning = false;
  private _expiryTimer: ReturnType<typeof setTimeout> | undefined;

  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    return document.createElement('nina-dwd-card-editor') as LovelaceCardEditor;
  }

  /**
   * Builds the configuration the card picker previews.
   *
   * It has to be a configuration `setConfig` accepts, so the preview shows the
   * card and not an error, and it must not write defaults into the user's YAML:
   * every option the card defaults to internally stays out of the stub.
   *
   * @param hass The Home Assistant object, if the picker passes one.
   * @param entities The entity ids the picker suggests, if any.
   */
  public static getStubConfig(hass?: HomeAssistant, entities?: string[]): NinaDwdCardConfig {
    const config: NinaDwdCardConfig = { type: 'custom:nina-dwd-card' };

    const candidates = entities?.length ? entities : Object.keys(hass?.states ?? {});
    // The first warning slot of a NINA area. The integration names its entities
    // after the area, in either language ("binary_sensor.warning_berlin_1",
    // "binary_sensor.nina_warnung_1"), so the warning word can sit anywhere in
    // the object id and only the trailing slot number is fixed.
    const firstSlot = candidates.find(
      (entityId) =>
        entityId.startsWith('binary_sensor.') && /(?:warning|warnung)/i.test(entityId) && /(?:^|_)1$/.test(entityId),
    );
    if (firstSlot) {
      config.nina_entity_prefix = [firstSlot.replace(/_?1$/, '')];
    }

    return config;
  }

  public setConfig(config: NinaDwdCardConfig): void {
    if (!config) {
      throw new Error(localize(this.hass, 'errors.invalid_configuration'));
    }

    // Reset translations if configuration changes that affects translation
    if (
      this._config &&
      (this._config.translation_target !== config.translation_target ||
        this._config.enable_translation !== config.enable_translation ||
        this._config.ai_entity_id !== config.ai_entity_id)
    ) {
      this._translations = {};
      this._translationInProgress.clear();
      this._hasLoggedTranslationWarning = false;
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

  /**
   * Whether the configuration names any warning source.
   *
   * A configuration without one is not an error - it is the state the card
   * picker previews and the state a half-finished editor session is in - so it
   * renders a hint instead of throwing a red error card.
   */
  private _hasWarningSource(): boolean {
    const prefix = this._config.nina_entity_prefix;
    const hasNina = Array.isArray(prefix) ? prefix.some((entry) => !!entry) : !!prefix;
    return hasNina || !!this._config.dwd_device;
  }

  private _renderNotConfigured(modeClass: string): TemplateResult {
    return html`
      <ha-card class=${modeClass}>
        ${this._config.title ? html`<div class="card-header">${this._config.title}</div>` : ''}
        <div class="card-content">
          <div class="no-warnings">${localize(this.hass, 'errors.no_entities_configured')}</div>
        </div>
      </ha-card>
    `;
  }

  /**
   * The height the card claims in the masonry layout.
   *
   * @returns The number of ~50px rows the card needs.
   */
  public getCardSize(): number {
    if (!this._config || !this.hass) return CARD_SIZE_PER_WARNING;

    const { ninaWarnings, dwdCurrentWarnings, dwdAdvanceWarnings } = this._collectWarnings();
    const count = this._processWarnings([...ninaWarnings, ...dwdCurrentWarnings, ...dwdAdvanceWarnings]).length;

    const header = this._config.title ? 1 : 0;
    const standaloneMap =
      this._getMapUrl() && (this._config.dwd_map_position === 'above' || this._config.dwd_map_position === 'below')
        ? CARD_SIZE_MAP
        : 0;

    return header + standaloneMap + Math.max(1, count * CARD_SIZE_PER_WARNING);
  }

  /**
   * The card's behaviour in the sections layout: full width, height from content.
   */
  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, rows: 'auto' };
  }

  private _renderWarnings(warnings: (NinaWarning | DwdWarning)[], mapUrl: string | undefined): TemplateResult {
    const firstDwdIndex = warnings.findIndex((w) => 'level' in w);

    return html`${warnings.map((warning, index) => {
      const key = this._getWarningKey(warning);
      const translation = this._translations[key];
      // A warning is not guaranteed to carry a headline or a description, and a
      // single incomplete one must not throw and take every other warning with it.
      const description = translation?.description || warning.description || '';
      const instruction = translation?.instruction || warning.instruction;
      const headline = this._getDisplayHeadline(warning, description);

      let processedDescription = description;
      let isTruncated = false;
      if (this._config.description_max_length && processedDescription.length > this._config.description_max_length) {
        isTruncated = true;
        if (!this._expandedWarnings.has(key)) {
          processedDescription = `${processedDescription.substring(0, this._config.description_max_length)}...`;
        }
      }

      return html`
        ${index > 0 ? html`<hr />` : ''}
        <div class="warning">
          ${
            'level' in warning &&
            mapUrl &&
            index === firstDwdIndex &&
            this._config.dwd_map_position !== 'above' &&
            this._config.dwd_map_position !== 'below' &&
            this._config.dwd_map_position !== 'none'
              ? html`<div class="map-container" @click=${() => (this._showLargeMap = true)} style="cursor: pointer;">
                  <img class="map-image" src=${mapUrl} alt=${localize(this.hass, 'card.map_alt')} />
                  ${(() => {
                    const pinStyle = this._calculatePinStyle();
                    return pinStyle
                      ? html`<div class="map-pin" style=${pinStyle}>
                          <div class="pin-icon"></div>
                        </div>`
                      : '';
                  })()}
                </div>`
              : ''
          }
          <div class="headline" style="color: ${this._getWarningColor(warning)}">
            <ha-icon icon=${this._getWarningIcon(warning)}></ha-icon> ${headline}
          </div>
          ${this._renderAreas(warning)}
          <div class="time">${formatTime(warning, this.hass)}</div>
          <div class="description">
            ${unsafeHTML(sanitizeHtml(processedDescription))}
            ${
              isTruncated
                ? html`
                    <a class="expand-button" @click=${() => this._toggleExpand(key)}>
                      ${
                        this._expandedWarnings.has(key)
                          ? localize(this.hass, 'card.show_less')
                          : localize(this.hass, 'card.show_more')
                      }
                    </a>
                  `
                : ''
            }
          </div>
          ${
            'level' in warning &&
            mapUrl &&
            this._config.dwd_map_position !== 'above' &&
            this._config.dwd_map_position !== 'below' &&
            this._config.dwd_map_position !== 'none'
              ? html`<div class="clearfix"></div>`
              : ''
          }
          ${
            !this._config.hide_instructions && instruction
              ? html` <ha-expansion-panel outlined>
                  <div slot="header">${localize(this.hass, 'card.recommended_actions')}</div>
                  <div class="instruction">${unsafeHTML(sanitizeHtml(instruction))}</div>
                </ha-expansion-panel>`
              : ''
          }
          ${this._renderFooter(warning)}
        </div>
      `;
    })}`;
  }

  /**
   * Renders the NINA area(s) a warning was reported for.
   * Only shown when `show_nina_area` is enabled and the warning carries area information.
   */
  private _renderAreas(warning: NinaWarning | DwdWarning): TemplateResult | string {
    if (!this._config.show_nina_area) return '';

    const areas = 'areas' in warning ? warning.areas : undefined;
    if (!areas?.length) return '';

    // Each area gets its own chip: NINA area names contain commas, so a joined
    // text line would be ambiguous. The full name stays available as a tooltip.
    return html`<div class="areas">
      <ha-icon icon="mdi:map-marker"></ha-icon>
      ${areas.map((area) => html`<span class="area-chip" title=${area}>${shortenNinaAreaName(area)}</span>`)}
    </div>`;
  }

  private _toggleExpand(key: string): void {
    if (this._expandedWarnings.has(key)) {
      this._expandedWarnings.delete(key);
    } else {
      this._expandedWarnings.add(key);
    }
    this.requestUpdate();
  }

  protected updated(changedProperties: Map<string | number | symbol, unknown>): void {
    if (!this.hass || !this._config) return;
    const { ninaWarnings, dwdCurrentWarnings, dwdAdvanceWarnings } = this._collectWarnings();
    const allWarnings = [...ninaWarnings, ...dwdCurrentWarnings, ...dwdAdvanceWarnings];

    if (changedProperties.has('hass') || changedProperties.has('_config')) {
      if (allWarnings.length > 0) {
        this._translateWarnings(allWarnings);
      }
    }

    this._scheduleExpiryRefresh(allWarnings);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearExpiryTimer();
  }

  private _clearExpiryTimer(): void {
    if (this._expiryTimer !== undefined) {
      clearTimeout(this._expiryTimer);
      this._expiryTimer = undefined;
    }
  }

  /**
   * Re-renders the card when the next displayed warning ends.
   *
   * Without this an expired warning would linger until the integration polls
   * again - up to five minutes for NINA, and indefinitely for a DWD sensor
   * whose other attributes do not change.
   *
   * @param warnings The warnings currently displayed.
   */
  private _scheduleExpiryRefresh(warnings: (NinaWarning | DwdWarning)[]): void {
    this._clearExpiryTimer();
    if (this._config?.hide_expired === false) return;

    const now = Date.now();
    const nextEnd = warnings
      .map((warning) => getWarningEndTime(warning))
      .filter((end): end is number => end !== undefined && end > now)
      .sort((a, b) => a - b)[0];

    if (nextEnd === undefined) return;

    // Capped: `setTimeout` overflows beyond ~24.8 days, and a long-running
    // warning is better re-checked periodically than trusted to one timer.
    const delay = Math.min(nextEnd - now + 1000, MAX_EXPIRY_TIMER_MS);
    this._expiryTimer = setTimeout(() => {
      this._expiryTimer = undefined;
      // The next timer is scheduled from `updated()` after this render.
      this.requestUpdate();
    }, delay);
  }

  protected render(): TemplateResult {
    if (!this._config || !this.hass) {
      return html``;
    }

    const { modeClass } = this._getThemeSettings();

    if (!this._hasWarningSource()) {
      return this._renderNotConfigured(modeClass);
    }

    const { ninaWarnings, dwdCurrentWarnings, dwdAdvanceWarnings } = this._collectWarnings();
    const mapUrl = this._getMapUrl();

    const hasDwdWarnings = [...dwdCurrentWarnings, ...dwdAdvanceWarnings].length > 0;
    const renderMap = (position: 'above' | 'below') => this._renderMap(position, mapUrl, hasDwdWarnings);

    const editMode = this._editMode;

    let cardContent: TemplateResult;

    if (this._config.separate_advance_warnings) {
      cardContent = this._renderSeparateView(
        ninaWarnings,
        dwdCurrentWarnings,
        dwdAdvanceWarnings,
        modeClass,
        editMode,
        mapUrl,
        renderMap,
      );
    } else {
      cardContent = this._renderCombinedView(
        ninaWarnings,
        dwdCurrentWarnings,
        dwdAdvanceWarnings,
        modeClass,
        editMode,
        mapUrl,
        renderMap,
      );
    }

    return html` ${cardContent} ${this._showLargeMap && mapUrl ? this._renderLightbox(mapUrl, modeClass) : ''} `;
  }

  private _getThemeSettings(): { isDarkMode: boolean; modeClass: string } {
    const themeMode = this._config.theme_mode || 'auto';
    if (themeMode === 'auto') {
      return { isDarkMode: !!this.hass.themes?.darkMode, modeClass: '' };
    }
    const isDarkMode = themeMode === 'dark';
    const modeClass = isDarkMode ? 'mode-dark' : 'mode-light';
    return { isDarkMode, modeClass };
  }

  private _collectWarnings() {
    const ninaWarnings: NinaWarning[] = this._getNinaWarnings();
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

    // Filtered here and not in _processWarnings, so hidden warnings are not translated either.
    const fragments = this._config.hide_headlines_containing;
    const hideExpired = this._config.hide_expired !== false;
    const now = Date.now();
    const unexpired = <T extends NinaWarning | DwdWarning>(warnings: T[]): T[] =>
      hideExpired ? warnings.filter((warning) => !isWarningExpired(warning, now)) : warnings;
    const visible = <T extends NinaWarning | DwdWarning>(warnings: T[]): T[] =>
      fragments?.length
        ? unexpired(warnings).filter(
            // Matched against the resolved source headline: a warning without a
            // headline is filtered by the description shown in its place. This is
            // deliberately not the rendered text in two configurations - with
            // `suppress_warning_text` the filter still sees the un-stripped
            // headline ("Amtliche Warnung vor Sturm", not "Sturm"), and with
            // `enable_translation` it sees the source language while the user
            // reads the translation. Fragments are therefore written against the
            // headline as the entity reports it.
            (warning) =>
              !isHeadlineHidden(getWarningHeadline(warning.headline, warning.description, this.hass), fragments),
          )
        : unexpired(warnings);

    return {
      ninaWarnings: visible(ninaWarnings),
      dwdCurrentWarnings: visible(dwdCurrentWarnings),
      dwdAdvanceWarnings: visible(dwdAdvanceWarnings),
    };
  }

  private _getMapUrl(): string | undefined {
    if (!this._config.dwd_map_land) return undefined;

    let mapUrl: string;
    if (this._config.dwd_map_type === 'region') {
      mapUrl = `https://www.dwd.de/DWD/warnungen/warnstatus/${this._config.dwd_map_land}.jpg`;
    } else {
      mapUrl = `https://www.dwd.de/DWD/warnungen/warnapp_gemeinden/json/warnungen_gemeinde_map_${this._config.dwd_map_land}.png`;
    }
    // Add a timestamp to prevent caching issues
    // We round to the nearest 5 minutes to allow some caching while ensuring freshness
    const timestamp = Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000);
    return `${mapUrl}?${timestamp}`;
  }

  private _renderDebugOverlay(mapData: MapData): TemplateResult {
    const { padding, bounds } = mapData;
    return html`
      <div class="debug-overlay">
        <div
          class="debug-region"
          style="top: 0; left: 0; right: 0; height: ${padding.top}%;"
          title=${`${localize(this.hass, 'card.debug.top')}: ${padding.top}%`}
        >
          ${localize(this.hass, 'card.debug.top')}: ${padding.top}%
        </div>
        <div
          class="debug-region"
          style="bottom: 0; left: 0; right: 0; height: ${padding.bottom}%;"
          title=${`${localize(this.hass, 'card.debug.bottom')}: ${padding.bottom}%`}
        >
          ${localize(this.hass, 'card.debug.bottom')}: ${padding.bottom}%
        </div>
        <div
          class="debug-region"
          style="top: 0; bottom: 0; left: 0; width: ${padding.left}%;"
          title=${`${localize(this.hass, 'card.debug.left')}: ${padding.left}%`}
        >
          ${localize(this.hass, 'card.debug.left')}: ${padding.left}%
        </div>
        <div
          class="debug-region"
          style="top: 0; bottom: 0; right: 0; width: ${padding.right}%;"
          title=${`${localize(this.hass, 'card.debug.right')}: ${padding.right}%`}
        >
          ${localize(this.hass, 'card.debug.right')}: ${padding.right}%
        </div>
        <div class="debug-info">
          <div><strong>${localize(this.hass, 'card.debug.map_bounds')}:</strong></div>
          <div>N: ${bounds.maxLat}°</div>
          <div>S: ${bounds.minLat}°</div>
          <div>E: ${bounds.maxLon}°</div>
          <div>W: ${bounds.minLon}°</div>
        </div>
      </div>
    `;
  }

  private _calculatePinStyle(): string {
    const mapLand = this._config.dwd_map_land;
    const mapData = mapLand ? MAP_DATA[mapLand] : undefined;

    let lat: number | undefined;
    let lon: number | undefined;

    // If a zone entity is configured, try to get coordinates from it
    if (this._config.map_pin_zone) {
      const zoneState = this.hass.states[this._config.map_pin_zone];
      if (zoneState) {
        lat = zoneState.attributes.latitude;
        lon = zoneState.attributes.longitude;
      }
    }

    if (!mapData || lat === undefined || lon === undefined) {
      return '';
    }

    const { bounds, padding } = mapData;
    const xNorm = (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon);
    const yNorm = (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat);

    const usableWidth = 100 - padding.left - padding.right;
    const usableHeight = 100 - padding.top - padding.bottom;

    const xPercent = padding.left + xNorm * usableWidth;
    const yPercent = padding.top + (1 - yNorm) * usableHeight;

    return `left: ${xPercent}%; top: ${yPercent}%;`;
  }

  private _renderMap(
    position: 'above' | 'below',
    mapUrl: string | undefined,
    hasDwdWarnings: boolean,
  ): TemplateResult | string {
    if (
      !mapUrl ||
      (!hasDwdWarnings && !this._config.show_map_without_warnings) ||
      this._config.dwd_map_position !== position
    ) {
      return '';
    }

    const mapLand = this._config.dwd_map_land;
    const mapData = mapLand ? MAP_DATA[mapLand] : undefined;
    const pinStyle = this._calculatePinStyle();

    return html`
      <div class="map-container" @click=${() => (this._showLargeMap = true)} style="cursor: pointer;">
        <img class="map-image-standalone" src=${mapUrl} alt=${localize(this.hass, 'card.map_alt')} />
        ${
          pinStyle
            ? html`<div class="map-pin" style=${pinStyle}>
                <div class="pin-icon"></div>
              </div>`
            : ''
        }
        ${this._config.debug_mode && mapData ? this._renderDebugOverlay(mapData) : ''}
      </div>
    `;
  }

  private _renderLightbox(mapUrl: string, modeClass: string): TemplateResult {
    return html`
      <div class="lightbox ${modeClass}" @click=${() => (this._showLargeMap = false)}>
        <div class="lightbox-content">
          <img src=${mapUrl} alt=${localize(this.hass, 'card.map_alt_large')} />
        </div>
      </div>
    `;
  }

  private _handleDialogClick(e: Event) {
    // Close on backdrop click (dialog element itself)
    if (e.target === e.currentTarget) {
      this._showLargeMap = false;
    }
  }

  private _renderSeparateView(
    ninaWarnings: NinaWarning[],
    dwdCurrentWarnings: DwdWarning[],
    dwdAdvanceWarnings: DwdWarning[],
    modeClass: string,
    editMode: boolean,
    mapUrl: string | undefined,
    renderMap: (pos: 'above' | 'below') => TemplateResult | string,
  ): TemplateResult {
    const currentRaw = [...ninaWarnings, ...dwdCurrentWarnings];
    const advanceRaw = [...dwdAdvanceWarnings];

    const processedCurrent = this._processWarnings(currentRaw);
    const processedAdvance = this._processWarnings(advanceRaw);

    const isHidden =
      processedCurrent.length === 0 &&
      processedAdvance.length === 0 &&
      this._config.hide_when_no_warnings &&
      !(
        this._config.show_map_without_warnings &&
        mapUrl &&
        (this._config.dwd_map_position === 'above' || this._config.dwd_map_position === 'below')
      );

    const cardStyle = `
      ${isHidden && editMode ? 'opacity: 0.5;' : ''}
      ${this._config.font_size ? `font-size: ${this._config.font_size}px;` : ''}
    `;

    if (isHidden && !editMode) {
      return html``;
    }

    return html`
      <ha-card class=${modeClass} style=${cardStyle}>
        ${this._config.title ? html`<div class="card-header">${this._config.title}</div>` : ''}
        <div class="card-content">
          ${renderMap('above')}
          <div class="warnings-container">
            ${
              processedCurrent.length > 0
                ? html`
                    <div class="sub-header">${localize(this.hass, 'card.current_warnings')}</div>
                    ${this._renderWarnings(processedCurrent, mapUrl)}
                  `
                : ''
            }
            ${
              processedAdvance.length > 0
                ? html`
                    ${processedCurrent.length > 0 ? html`<hr class="section-divider" />` : ''}
                    <div class="sub-header">${localize(this.hass, 'card.advance_warnings')}</div>
                    ${this._renderWarnings(processedAdvance, undefined)}
                  `
                : ''
            }
            ${processedCurrent.length === 0 && processedAdvance.length === 0 ? this._renderNoWarnings() : ''}
            ${
              isHidden && editMode
                ? html`<div class="no-warnings">${localize(this.hass, 'card.hidden_in_view_mode')}</div>`
                : ''
            }
          </div>
          ${renderMap('below')}
        </div>
      </ha-card>
    `;
  }

  private _renderCombinedView(
    ninaWarnings: NinaWarning[],
    dwdCurrentWarnings: DwdWarning[],
    dwdAdvanceWarnings: DwdWarning[],
    modeClass: string,
    editMode: boolean,
    mapUrl: string | undefined,
    renderMap: (pos: 'above' | 'below') => TemplateResult | string,
  ): TemplateResult {
    const allWarningsRaw = [...ninaWarnings, ...dwdCurrentWarnings, ...dwdAdvanceWarnings];
    const processedWarnings = this._processWarnings(allWarningsRaw);

    const isHidden =
      processedWarnings.length === 0 &&
      this._config.hide_when_no_warnings &&
      !(
        this._config.show_map_without_warnings &&
        mapUrl &&
        (this._config.dwd_map_position === 'above' || this._config.dwd_map_position === 'below')
      );

    const cardStyle = `
      ${isHidden && editMode ? 'opacity: 0.5;' : ''}
      ${this._config.font_size ? `font-size: ${this._config.font_size}px;` : ''}
    `;

    if (isHidden && !editMode) return html``;

    return html`
      <ha-card class=${modeClass} style=${cardStyle}>
        ${this._config.title ? html`<div class="card-header">${this._config.title}</div>` : ''}
        <div class="card-content">
          ${renderMap('above')}
          <div class="warnings-container">
            ${
              processedWarnings.length === 0
                ? this._renderNoWarnings()
                : this._renderWarnings(processedWarnings, mapUrl)
            }
            ${
              isHidden && editMode
                ? html`<div class="no-warnings">${localize(this.hass, 'card.hidden_in_view_mode')}</div>`
                : ''
            }
          </div>
          ${renderMap('below')}
        </div>
      </ha-card>
    `;
  }

  private _renderNoWarnings(): TemplateResult {
    return html`<div
      class="no-warnings"
      style="color: ${this._config.color_overrides?.no_warning || SEVERITY_COLORS[0]}"
    >
      ${localize(this.hass, 'card.no_warnings')}
    </div>`;
  }

  private _renderFooter(warning: NinaWarning | DwdWarning): TemplateResult {
    if (this._config.hide_footer) {
      return html``;
    }

    return html`<div class="footer">
      <div class="sender">
        ${
          'sender' in warning && warning.sender
            ? localize(this.hass, 'card.source', { sender: warning.sender })
            : 'level' in warning
              ? localize(this.hass, 'card.source', { sender: 'Deutscher Wetterdienst' })
              : ''
        }
      </div>
      <div class="actions">
        ${
          'warning_id' in warning && warning.warning_id
            ? html`<a
                class="bund-link"
                href="https://warnung.bund.de/meldungen/${warning.warning_id}"
                target="_blank"
                rel="noopener noreferrer"
                title=${localize(this.hass, 'card.official_warning_link')}
              >
                BUND.DE <ha-icon icon="mdi:open-in-new"></ha-icon>
              </a>`
            : ''
        }
        <ha-icon-button
          class="info-button"
          .label=${localize(this.hass, 'card.more_info', { headline: this._getDisplayHeadline(warning) })}
          @click=${() => this._handleMoreInfo(warning.entity_id)}
          ><ha-icon icon="mdi:information-outline"></ha-icon
        ></ha-icon-button>
      </div>
    </div>`;
  }

  private _getWarningColor(warning: NinaWarning | DwdWarning): string {
    const overrides = this._config.color_overrides || {};
    const score = this._getSeverityScore(warning);

    switch (score) {
      case 4:
        return overrides.extreme || SEVERITY_COLORS[4];
      case 3:
        return overrides.severe || SEVERITY_COLORS[3];
      case 2:
        return overrides.moderate || SEVERITY_COLORS[2];
      case 1:
        return overrides.minor || SEVERITY_COLORS[1];
      case 0:
        return overrides.no_warning || SEVERITY_COLORS[0];
      default:
        return '#999999';
    }
  }

  private _getNinaWarnings(): NinaWarning[] {
    const warnings: NinaWarning[] = [];
    if (!this.hass) return warnings;
    const prefixes = Array.isArray(this._config.nina_entity_prefix)
      ? this._config.nina_entity_prefix
      : this._config.nina_entity_prefix
        ? [this._config.nina_entity_prefix]
        : [];

    if (prefixes.length === 0) return warnings;

    const warningsById = new Map<string, NinaWarning>();

    for (const prefix of prefixes) {
      if (!prefix) continue;
      // Every slot is probed, not just the ones up to the first gap: a user can
      // disable the NINA slot entities they do not need, and an integration
      // reload can leave the registry without slot 1 while slot 2 is still
      // there. The total number of rendered warnings is limited later.
      for (let i = 1; i <= MAX_WARNING_SLOTS; i++) {
        let entityId = `${prefix}_${i}`;
        if (!this.hass.states[entityId]) {
          entityId = `${prefix}${i}`;
        }
        const stateObj = this.hass.states[entityId];

        if (stateObj && stateObj.state === 'on') {
          // `hass.states` is untyped, so every attribute has to be narrowed here,
          // at the boundary where the data enters the card. A headline that is a
          // number or an array would otherwise reach the render path typed as a
          // string and throw on the first string operation.
          const headline = asOptionalString(stateObj.attributes.headline);
          const description = asOptionalString(stateObj.attributes.description);
          const instruction =
            asOptionalString(stateObj.attributes.instruction) ??
            asOptionalString(stateObj.attributes.recommended_actions);

          const warningId =
            stateObj.attributes.id ||
            stateObj.attributes.warning_id ||
            `${headline || ''}-${stateObj.attributes.start || ''}-${description || ''}`;

          const area = getNinaAreaName(stateObj.attributes.friendly_name, prefix);

          const known = warningsById.get(warningId);
          if (known) {
            // The same warning can cover several configured areas. Keep one entry
            // but remember every area it was reported for.
            if (area && !known.areas!.includes(area)) {
              known.areas!.push(area);
            }
            continue;
          }

          const warning: NinaWarning = {
            headline,
            description,
            sender: stateObj.attributes.sender,
            entity_id: entityId,
            severity: stateObj.attributes.severity,
            start: stateObj.attributes.start,
            expires: stateObj.attributes.expires,
            instruction,
            warning_id: stateObj.attributes.id,
            sent: stateObj.attributes.sent,
            areas: area ? [area] : [],
          };

          warningsById.set(warningId, warning);
          warnings.push(warning);
        }
      }
    }
    return warnings;
  }

  private _getDwdWarnings(entityId?: string): DwdWarning[] {
    const warnings: DwdWarning[] = [];
    if (!entityId) return warnings;

    const stateObj = this.hass.states[entityId];
    if (!stateObj || stateObj.state === '0') return warnings;

    // The state of the sensor indicates the highest warning level, not the number of warnings.
    // We iterate until we no longer find warning attributes.
    for (let i = 1; i <= MAX_WARNING_SLOTS; i++) {
      const rawHeadline = stateObj.attributes[`warning_${i}_headline`];
      // An absent or empty headline attribute marks the end of the list. A
      // headline that is present but not a string does not: the warning exists,
      // it is just malformed, so it is kept and rendered without a headline.
      if (rawHeadline === undefined || rawHeadline === null || rawHeadline === '') {
        break;
      }

      // The DWD attributes are as untyped as the NINA ones, so they are narrowed
      // at the same boundary. Anything that is not a string counts as absent.
      warnings.push({
        headline: asOptionalString(rawHeadline),
        description: asOptionalString(stateObj.attributes[`warning_${i}_description`]),
        entity_id: entityId,
        level: stateObj.attributes[`warning_${i}_level`],
        start: stateObj.attributes[`warning_${i}_start`],
        end: stateObj.attributes[`warning_${i}_end`],
        instruction: asOptionalString(stateObj.attributes[`warning_${i}_instruction`]),
        event: stateObj.attributes[`warning_${i}_type`],
      });
    }

    return warnings;
  }

  private _processWarnings(warningsToProcess: (NinaWarning | DwdWarning)[]): (NinaWarning | DwdWarning)[] {
    const warnings = warningsToProcess;

    const deduplicatedWarnings = new Map<string, (NinaWarning | DwdWarning)[]>();

    const getWarningKey = (headline: string | undefined | null): string => {
      return stripWarningPrefix(headline).toLowerCase().trim();
    };

    // Group by headline
    for (const warning of warnings) {
      const key = getWarningKey(warning.headline);
      if (!deduplicatedWarnings.has(key)) {
        deduplicatedWarnings.set(key, []);
      }
      deduplicatedWarnings.get(key)!.push(warning);
    }

    const processedWarnings: (NinaWarning | DwdWarning)[] = [];

    // Process each group
    for (const group of deduplicatedWarnings.values()) {
      // If only one warning in group, just use it
      if (group.length === 1) {
        processedWarnings.push(group[0]);
        continue;
      }

      // If multiple, try to merge identical content
      // We need to compare description and instruction
      // We can use a simple O(N^2) approach or sort/map. Given small N usually, simple loop is fine.
      const mergedInGroup: (NinaWarning | DwdWarning)[] = [];

      // Warnings merged into one entry can originate from different NINA areas.
      const mergeAreas = (target: NinaWarning | DwdWarning, source: NinaWarning | DwdWarning): void => {
        const sourceAreas = 'areas' in source ? source.areas : undefined;
        if (!sourceAreas?.length) return;
        const targetAreas = ('areas' in target ? target.areas : undefined) || [];
        (target as NinaWarning).areas = [...targetAreas, ...sourceAreas.filter((a) => !targetAreas.includes(a))];
      };

      const normalize = (str: string | undefined | null): string => {
        return (str || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/[·•.]/g, '')
          .replace(/;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      };

      for (const warning of group) {
        let merged = false;
        for (const existing of mergedInGroup) {
          // Check if content matches
          const descriptionMatch = normalize(warning.description) === normalize(existing.description);
          const instructionMatch =
            this._config.hide_instructions || normalize(warning.instruction) === normalize(existing.instruction);

          if (descriptionMatch && instructionMatch) {
            // MERGE
            // Check if one is DWD and the other is NINA. Prefer DWD to keep icons.
            const isDwd = (w: NinaWarning | DwdWarning) => 'event' in w || ('level' in w && w.level !== undefined);

            // If existing is NINA and new is DWD, swap them so we keep DWD as base
            if (!isDwd(existing) && isDwd(warning)) {
              // Swap content of existing with warning
              const tempStart = existing.start;
              const tempEnd = 'expires' in existing ? (existing as NinaWarning).expires : (existing as DwdWarning).end;

              // Copy properties from DWD warning to existing object (effectively morphing it)
              Object.assign(existing, warning);

              // Restore/Merge times
              const existingStartMs = tempStart ? new Date(tempStart).getTime() : 0;
              const newStartMs = warning.start ? new Date(warning.start).getTime() : 0;
              if (existingStartMs < newStartMs && tempStart) {
                existing.start = tempStart;
              }

              const getEndTime = (w: NinaWarning | DwdWarning) => {
                if ('expires' in w) return w.expires ? new Date(w.expires).getTime() : 0;
                if ('end' in w) return w.end ? new Date(w.end).getTime() : 0;
                return 0;
              };

              // We already assigned warning to existing, so existing now has DWD end time.
              // Check if the original NINA end time was later
              const originalEndMs = tempEnd ? new Date(tempEnd).getTime() : 0;
              const newEndMs = getEndTime(warning);

              if (originalEndMs > newEndMs && tempEnd) {
                if ('expires' in existing) (existing as NinaWarning).expires = tempEnd;
                // DWD uses 'end', we just converted it to DWD type effectively, so use 'end'
                else (existing as DwdWarning).end = tempEnd;
              }
            } else {
              // Normal merge (existing is base)
              // Update start time to be the earliest
              const existingStart = existing.start ? new Date(existing.start).getTime() : 0;
              const newStart = warning.start ? new Date(warning.start).getTime() : 0;
              if (newStart < existingStart) {
                existing.start = warning.start;
              }

              // Update end/expires time to be the latest
              const getEndTime = (w: NinaWarning | DwdWarning) => {
                if ('expires' in w) return w.expires ? new Date(w.expires).getTime() : 0;
                if ('end' in w) return w.end ? new Date(w.end).getTime() : 0;
                return 0;
              };

              const existingEnd = getEndTime(existing);
              const newEnd = getEndTime(warning);

              if (newEnd > existingEnd) {
                if ('expires' in existing && 'expires' in warning) {
                  (existing as NinaWarning).expires = (warning as NinaWarning).expires;
                } else if ('end' in existing && 'end' in warning) {
                  (existing as DwdWarning).end = (warning as DwdWarning).end;
                }
              }
            }

            mergeAreas(existing, warning);

            merged = true;
            break;
          }
        }
        if (!merged) {
          mergedInGroup.push({ ...warning }); // Clone to avoid mutating original if needed, though we mutate the clone above
        }
      }
      processedWarnings.push(...mergedInGroup);
    }

    let processed = processedWarnings
      .sort((a, b) => this._getSeverityScore(b) - this._getSeverityScore(a))
      .filter((warning) => {
        if (!this._config.hide_on_level_below) return true;
        return this._getSeverityScore(warning) >= (this._config.hide_on_level_below ?? 0);
      });

    if (this._config.max_warnings) {
      processed = processed.slice(0, this._config.max_warnings);
    }

    return processed;
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

  private async _translateWarnings(warnings: (NinaWarning | DwdWarning)[]): Promise<void> {
    if (!this._config.enable_translation || !this.hass) return;

    const targetLanguage = this._config.translation_target || 'English';
    const [domain, service] = ['ai_task', 'generate_data'];

    for (const warning of warnings) {
      const key = this._getWarningKey(warning);

      // Check in-memory state first
      if (this._translations[key]) {
        continue;
      }

      // Check persistent cache
      const cached = this._cache.get(targetLanguage, key);
      if (cached) {
        this._translations = {
          ...this._translations,
          [key]: {
            headline: cached.headline,
            description: cached.description,
            instruction: cached.instruction,
          },
        };
        continue;
      }

      if (this._translationInProgress.has(key)) {
        continue;
      }

      // Mark as in-progress
      this._translationInProgress.add(key);

      try {
        const headlineForTranslation = this._getDisplayHeadline(warning);

        const prompt = DEFAULT_AI_PROMPT.replace('{{ target_language }}', targetLanguage)
          .replace('{{ headline }}', headlineForTranslation)
          .replace('{{ description }}', warning.description || '')
          .replace('{{ instruction }}', warning.instruction || '');

        const serviceData: Record<string, unknown> = {
          instructions: prompt,
          task_name: 'translate_warning',
        };

        if (this._config.ai_entity_id) {
          serviceData.entity_id = this._config.ai_entity_id;
        }

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Service call timed out')), 30000),
        );

        const response = (await Promise.race([
          this.hass.callService(domain, service, serviceData, undefined, undefined, true),
          timeoutPromise,
        ])) as unknown;

        let translatedText: unknown = '';
        if (response && typeof response === 'object' && 'result' in response) {
          translatedText = (response as Record<string, unknown>).result as string;
        } else if (response && typeof response === 'object' && 'response' in response) {
          translatedText = (response as Record<string, unknown>).response as string;
        } else if (response && typeof response === 'object' && 'text' in response) {
          translatedText = (response as Record<string, unknown>).text as string;
        } else if (response && typeof response === 'object' && 'data' in response) {
          translatedText = (response as Record<string, unknown>).data as unknown;
        }

        if (translatedText) {
          try {
            let translation: unknown;
            if (typeof translatedText === 'string') {
              const jsonMatch = translatedText.match(/\{[\s\S]*\}/);
              const jsonStr = jsonMatch ? jsonMatch[0] : translatedText;
              translation = JSON.parse(jsonStr);
            } else if (typeof translatedText === 'object') {
              if (
                'data' in (translatedText as Record<string, unknown>) &&
                typeof (translatedText as Record<string, unknown>).data === 'string'
              ) {
                const innerText = (translatedText as Record<string, unknown>).data as string;
                const jsonMatch = innerText.match(/\{[\s\S]*\}/);
                const jsonStr = jsonMatch ? jsonMatch[0] : innerText;
                translation = JSON.parse(jsonStr);
              } else {
                translation = translatedText;
              }
            }

            if (translation) {
              const translationObj = translation as Record<string, string>;
              const result = {
                headline: translationObj.headline || warning.headline || '',
                description: translationObj.description || warning.description || '',
                instruction: translationObj.instruction || warning.instruction || '',
              };

              // Update in-memory state
              this._translations = {
                ...this._translations,
                [key]: result,
              };

              // Save to persistent cache
              this._cache.set(targetLanguage, key, result);
            }
          } catch (e) {
            console.warn(`NINA-DWD: ${localize(this.hass, 'errors.ai_translation_parse_error')}`, e);
            // Save original warning text in translations map so we don't keep retrying this request
            this._translations = {
              ...this._translations,
              [key]: {
                headline: warning.headline || '',
                description: warning.description || '',
                instruction: warning.instruction || '',
              },
            };
          }
        }
      } catch (e) {
        const message = e && typeof e === 'object' && 'message' in e ? (e.message as string) : '';
        if (message.includes('No entity_id provided') || message.includes('no preferred entity set')) {
          if (!this._hasLoggedTranslationWarning) {
            console.warn(`NINA-DWD: ${localize(this.hass, 'errors.ai_translation_config_error')}`);
            this._hasLoggedTranslationWarning = true;
          }
        } else {
          console.error('NINA-DWD: Translation failed', e);
        }
        // Save original warning text in translations map so we don't keep retrying this request
        this._translations = {
          ...this._translations,
          [key]: {
            headline: warning.headline || '',
            description: warning.description || '',
            instruction: warning.instruction || '',
          },
        };
      } finally {
        this._translationInProgress.delete(key);
      }

      // Add a small delay between requests to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Resolves the headline exactly as it is rendered for a warning: translated if a
   * translation is available, falling back to the description when the warning
   * carries no headline, and with the "Amtliche Warnung vor" prefix stripped when
   * `suppress_warning_text` is set.
   *
   * Everything that has to agree with the visible headline - the info button's
   * aria-label, the translation prompt - goes through here.
   *
   * @param warning The warning to resolve the headline for.
   * @param description An already resolved description, if the caller has one.
   */
  private _getDisplayHeadline(warning: NinaWarning | DwdWarning, description?: string): string {
    const translation = this._translations[this._getWarningKey(warning)];
    const resolvedDescription = description ?? translation?.description ?? warning.description ?? '';
    const headline = getWarningHeadline(translation?.headline || warning.headline, resolvedDescription, this.hass);

    return this._config?.suppress_warning_text ? stripWarningPrefix(headline) : headline;
  }

  private _getWarningKey(warning: NinaWarning | DwdWarning): string {
    // Use a combination of properties to create a unique key for translation caching
    return `${warning.headline || ''}|${warning.description || ''}|${warning.instruction || ''}`;
  }

  private _getWarningIcon(warning: NinaWarning | DwdWarning): string {
    if ('event' in warning && warning.event !== undefined) {
      const icon = EVENT_CODE_ICONS[warning.event];
      if (icon) {
        return icon;
      }
    }
    return 'mdi:alert-circle-outline';
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
  getEntitySuggestion: (hass: HomeAssistant, entityId: string) => {
    if (entityId.startsWith('sensor.nina_')) {
      const prefix = entityId.replace(/_?\d+$/, '');
      return {
        config: {
          type: 'custom:nina-dwd-card',
          nina_entity_prefix: [prefix],
        },
      };
    }
    const entity = hass.entities[entityId];
    const isDwd =
      entityId.endsWith('_aktuelle_warnstufe') ||
      entityId.endsWith('_current_warning_level') ||
      entityId.endsWith('_vorwarnstufe') ||
      entityId.endsWith('_advance_warning_level');
    if (isDwd && entity?.device_id) {
      return {
        config: {
          type: 'custom:nina-dwd-card',
          dwd_device: entity.device_id,
        },
      };
    }
    return null;
  },
});
