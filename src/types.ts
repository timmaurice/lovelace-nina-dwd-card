/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LovelaceCardConfig {
  type: string;
  [key: string]: any;
}

export interface LovelaceCard extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
  getCardSize?(): number | Promise<number>;
}

export interface LovelaceCardEditor extends HTMLElement {
  hass?: HomeAssistant;
  setConfig(config: LovelaceCardConfig): void;
}

export interface HaCard extends LovelaceCard {
  header?: string;
}

declare global {
  interface HTMLElementTagNameMap {
    // Cast to HaCard to support header property
    'ha-card': HaCard;
    'hui-error-card': LovelaceCard;
  }
}

export interface NinaWarning {
  headline: string;
  description: string;
  sender: string;
  entity_id: string;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme' | 'Unknown';
  start: string;
  instruction?: string;
  expires: string;
}

export interface DwdWarning {
  headline: string;
  description: string;
  entity_id: string;
  level: number;
  start: string;
  end: string;
  instruction?: string;
}

export interface NinaDwdCardConfig extends LovelaceCardConfig {
  title?: string;
  nina_entity_prefix?: string;
  max_warnings?: number;
  dwd_device?: string;
  dwd_map_land?: string;
  hide_footer?: boolean;
  hide_when_no_warnings?: boolean;
}

export interface HomeAssistant {
  hass?: any;
  states: Record<string, any>;
  entities: Record<string, any>;
  devices: Record<string, any>;
  services: Record<string, any>;
  language: string;
  localize: (key: string, ...args: any[]) => string;
  locale: {
    language: string;
    number_format: string;
    time_format: string;
  };
  callWS: <T>(message: any) => Promise<T>;
}
