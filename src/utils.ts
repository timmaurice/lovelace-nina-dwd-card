import { HomeAssistant, NinaWarning, DwdWarning } from './types';
import { localize } from './localize';

export const WARNING_PREFIX_REGEX = /^(Amtliche (Unwetter)?warnung vor |VORABINFORMATION UNWETTER vor )/i;

// Trailing "Warning 1" / "Warnung 3" / bare slot number of a NINA entity name.
const NINA_SLOT_SUFFIX_REGEX = /(?:\s(?:Warning|Warnung))?\s*\d*$/;

const NINA_NOISE_WORDS = ['nina', 'warning', 'warnung'];

/**
 * Derives a human readable area name for a NINA entity.
 *
 * Prefers the friendly name of the entity with its warning slot suffix removed
 * (e.g. "Karlsruhe (Stadt) Warnung 1" -> "Karlsruhe (Stadt)"). Falls back to the
 * entity prefix, prettified (e.g. "binary_sensor.nina_warnung_karlsruhe" -> "Karlsruhe").
 *
 * @param friendlyName The friendly name of the warning slot entity, if available.
 * @param entityPrefix The configured NINA entity prefix.
 */
export function getNinaAreaName(friendlyName: string | undefined, entityPrefix: string): string {
  if (friendlyName) {
    const label = friendlyName.replace(NINA_SLOT_SUFFIX_REGEX, '').trim();
    if (label) return label;
  }

  const objectId = entityPrefix.split('.').pop() || entityPrefix;
  const words = objectId.split('_').filter(Boolean);
  const meaningful = words.filter((word) => !NINA_NOISE_WORDS.includes(word.toLowerCase()));
  const parts = meaningful.length > 0 ? meaningful : words;

  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

// Trailing "(<District> - <State>)" of a NINA area name. The " - " separator is
// what distinguishes it from a parenthetical that belongs to the place name
// itself, e.g. "Battenberg (Eder)".
const NINA_DISTRICT_SUFFIX_REGEX = /\s*\([^()]+ - [^()]+\)\s*$/;

/**
 * Shortens a NINA area name for display by dropping the district and state suffix,
 * e.g. "Battenberg (Eder), Stadt (Waldeck-Frankenberg - Hessen)" -> "Battenberg (Eder), Stadt".
 *
 * @param area The full NINA area name.
 */
export function shortenNinaAreaName(area: string): string {
  return area.replace(NINA_DISTRICT_SUFFIX_REGEX, '').trim() || area;
}

/**
 * Checks whether a headline contains one of the fragments and should therefore be hidden,
 * e.g. "hitze" hides "Amtliche WARNUNG vor extremer HITZE". Blank fragments are ignored.
 *
 * @param headline The headline of the warning.
 * @param fragments The configured headline fragments to hide.
 */
export function isHeadlineHidden(headline: string, fragments: string[] | undefined): boolean {
  if (!fragments?.length) return false;

  const haystack = (headline || '').toLowerCase();
  return fragments.some((fragment) => {
    const needle = fragment?.trim().toLowerCase();
    return !!needle && haystack.includes(needle);
  });
}

/**
 * Dispatches a custom event with an optional detail value.
 *
 * @param node The element to dispatch the event from.
 * @param type The name of the event.
 * @param detail The detail value to pass with the event.
 * @param options The options for the event.
 */
export const fireEvent = <T>(
  node: HTMLElement | Window,
  type: string,
  detail?: T,
  options?: CustomEventInit<T>,
): void => {
  const event = new CustomEvent(type, { bubbles: true, cancelable: false, composed: true, ...options, detail });
  // Dispatch from window to ensure it reaches the dialog manager
  node.dispatchEvent(event);
};

export function formatTime(warning: NinaWarning | DwdWarning, hass: HomeAssistant): string {
  try {
    let startStr = 'start' in warning ? warning.start : '';
    if (!startStr && 'sent' in warning && warning.sent) {
      startStr = warning.sent;
    }
    const endStr = 'expires' in warning ? warning.expires : warning.end;

    if (!startStr) return localize(hass, 'card.time_unknown');

    const start = new Date(startStr);
    const now = new Date();

    const timeFormat: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: 'numeric',
    };

    const getDayString = (date: Date): string => {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const checkDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      if (checkDay.getTime() === today.getTime()) {
        return localize(hass, 'card.today');
      }
      if (checkDay.getTime() === yesterday.getTime()) {
        return localize(hass, 'card.yesterday');
      }
      if (checkDay.getTime() === tomorrow.getTime()) {
        return localize(hass, 'card.tomorrow');
      }
      return new Intl.DateTimeFormat(hass.locale.language, { weekday: 'short' }).format(date);
    };

    const formattedStartTime = new Intl.DateTimeFormat(hass.locale.language, timeFormat).format(start);
    const startDayString = getDayString(start);

    if (!endStr) return `${startDayString}, ${formattedStartTime}`;

    const end = new Date(endStr);
    const formattedEndTime = new Intl.DateTimeFormat(hass.locale.language, timeFormat).format(end);
    const endDayString = getDayString(end);

    // If start and end are on the same day, just show times
    if (startDayString === endDayString) {
      return `${startDayString}, ${formattedStartTime} - ${formattedEndTime}`;
    }

    return `${startDayString}, ${formattedStartTime} - ${endDayString}, ${formattedEndTime}`;
  } catch (e) {
    console.error('NINA-DWD: Error formatting time', e);
    return localize(hass, 'card.time_invalid');
  }
}
