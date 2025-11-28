export interface TranslationObject {
  [key: string]: string | TranslationObject;
}

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
  event?: number;
}

export interface NinaDwdCardConfig extends LovelaceCardConfig {
  title?: string;
  nina_entity_prefix?: string;
  max_warnings?: number;
  dwd_device?: string;
  dwd_map_land?: string;
  map_pin_zone?: string;
  debug_mode?: boolean;
  show_map_without_warnings?: boolean;
  hide_when_no_warnings?: boolean;
  hide_instructions?: boolean;
  hide_footer?: boolean;
  separate_advance_warnings?: boolean;
  hide_on_level_below?: number;
  theme_mode?: 'auto' | 'light' | 'dark';
  color_overrides?: {
    no_warning?: string;
    minor?: string;
    moderate?: string;
    severe?: string;
    extreme?: string;
  };
  enable_translation?: boolean;
  translation_target?: string;
  ai_entity_id?: string;
}

export interface HomeAssistant {
  auth: any;
  connection: any;
  connected: boolean;
  states: Record<string, any>;
  entities: Record<string, any>;
  devices: Record<string, any>;
  areas: Record<string, any>;
  services: Record<string, any>;
  config: any;
  themes: {
    darkMode: boolean;
    themes: Record<string, any>;
  };
  selectedTheme: string | null;
  panels: Record<string, any>;
  panelUrl: string;
  language: string;
  selectedLanguage: string | null;
  locale: {
    language: string;
    number_format: string;
    time_format: string;
  };
  resources: any;
  localize: (key: string, ...args: any[]) => string;
  translationMetadata: any;
  suspendWhenHidden: boolean;
  enableShortcuts: boolean;
  vibrate: boolean;
  dockedSidebar: 'docked' | 'always_hidden' | 'auto';
  defaultPanel: string;
  moreInfoEntityId: string | null;
  user: any;
  callService: (
    domain: string,
    service: string,
    serviceData?: Record<string, any>,
    target?: {
      entity_id?: string | string[];
      device_id?: string | string[];
      area_id?: string | string[];
    },
    notify?: boolean,
    returnResponse?: boolean,
  ) => Promise<any>;
  callApi: <T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    parameters?: Record<string, any>,
    headers?: Record<string, string>,
  ) => Promise<T>;
  callWS: <T>(msg: any) => Promise<T>;
  loadBackendTranslation: (category: string, integration?: string | string[], configFlow?: boolean) => Promise<any>;
}
