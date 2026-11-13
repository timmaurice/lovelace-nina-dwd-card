// Types for seam.mjs, for the tests that import it.
export interface Contract {
  nina: { slotAttributes: string[]; details: string[]; services: string[]; slotName: string | null };
  dwd: {
    sensors: string[];
    sensorNames: Record<string, string | null>;
    attributes: string[];
    warningAttributes: string[];
  };
}
export interface MapSize {
  type: string;
  width: number;
  height: number;
}
export const CORE_FILES: string[];
export const CORE_BASE: string;
export const CARD_READS: {
  nina: { slotAttributes: string[]; details: string[]; services: string[] };
  dwd: { warningAttributes: string[]; sensorSuffixes: { current: string; advance: string } };
};
export function extractContract(files: Record<string, string>): Contract;
export function recordedCoreFiles(): Record<string, string>;
export function missingForCard(contract: Contract): string[];
export function lost(recorded: Contract, live: Contract): string[];
export function mapOptions(): { state: string[]; region: string[] };
export function mapUrl(kind: 'state' | 'region', key: string): string;
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null;
export function ratioMoved(recorded: MapSize, live: MapSize): boolean;
export function recordedMaps(): { state: Record<string, MapSize>; region: Record<string, MapSize> };
export const slug: (name: string) => string;
