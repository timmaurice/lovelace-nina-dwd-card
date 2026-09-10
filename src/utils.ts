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
 * Tolerates a missing headline for the same reason as {@link stripWarningPrefix}:
 * callers pass the resolved headline, which is not guaranteed to exist.
 *
 * @param headline The headline of the warning, if available.
 * @param fragments The configured headline fragments to hide.
 */
export function isHeadlineHidden(headline: string | undefined | null, fragments: string[] | undefined): boolean {
  if (!fragments?.length) return false;

  const haystack = (headline || '').toLowerCase();
  return fragments.some((fragment) => {
    const needle = fragment?.trim().toLowerCase();
    return !!needle && haystack.includes(needle);
  });
}

/** Longest description snippet used as a stand-in headline. */
const HEADLINE_FALLBACK_MAX_LENGTH = 80;

/**
 * Removes the "Amtliche Warnung vor" style prefix from a headline.
 *
 * Tolerates a missing headline on purpose: NINA and DWD entities do not
 * guarantee the attribute, and a single incomplete warning must never be able
 * to throw and blank the whole card.
 *
 * @param headline The headline of the warning, if available.
 */
export function stripWarningPrefix(headline: string | undefined | null): string {
  return (headline || '').replace(WARNING_PREFIX_REGEX, '');
}

/**
 * Resolves the text to display as the headline of a warning.
 *
 * A warning without a headline is rendered with what it does carry instead of
 * being dropped: the first line of its description, or a generic label when
 * even that is missing.
 *
 * @param headline The headline of the warning, if available.
 * @param description The description of the warning, if available.
 * @param hass The Home Assistant object, used for the generic label. Optional on
 *   purpose: this function must not throw before `hass` has been set.
 */
export function getWarningHeadline(
  headline: string | undefined | null,
  description: string | undefined | null,
  hass: HomeAssistant | undefined,
): string {
  const text = (headline || '').trim();
  if (text) return text;

  // The description is HTML, so tags are stripped before it is used as a title.
  const fromDescription = (description || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (fromDescription) {
    return fromDescription.length > HEADLINE_FALLBACK_MAX_LENGTH
      ? `${fromDescription.substring(0, HEADLINE_FALLBACK_MAX_LENGTH).trim()}...`
      : fromDescription;
  }

  return localize(hass, 'card.headline_missing');
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

/**
 * Resolves the end of a warning in milliseconds.
 *
 * NINA reports `expires`, the DWD integration reports `end`. A missing or
 * unparsable value yields `undefined`, which callers must read as "no known
 * end" and never as "already over".
 *
 * @param warning The warning to read the end time from.
 */
export function getWarningEndTime(warning: NinaWarning | DwdWarning): number | undefined {
  const raw = 'expires' in warning ? warning.expires : 'end' in warning ? warning.end : undefined;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;

  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? undefined : time;
}

/**
 * Checks whether a warning has already ended.
 *
 * Both source integrations poll (the NINA one every five minutes), so an
 * entity can stay `on` well past the end of its warning. A warning without a
 * known end time is never considered expired.
 *
 * @param warning The warning to check.
 * @param now The reference timestamp in milliseconds, defaults to the current time.
 */
export function isWarningExpired(warning: NinaWarning | DwdWarning, now: number = Date.now()): boolean {
  const end = getWarningEndTime(warning);
  return end !== undefined && end < now;
}

/** A day distance beyond which a weekday alone no longer identifies a date. */
const WEEKDAY_ONLY_MAX_DAY_DISTANCE = 6;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

    // The user's 12h/24h preference from their Home Assistant profile. The two
    // other values HA offers ('language', 'system') deliberately fall through to
    // whatever the locale implies.
    if (hass.locale?.time_format === 'am_pm') {
      timeFormat.hour12 = true;
    } else if (hass.locale?.time_format === 'twenty_four') {
      timeFormat.hour12 = false;
    }

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
      // A weekday alone only identifies a day inside the current week. Warnings
      // can run for months (African swine fever zones, water shortages), and
      // "Wed, 10:32" for a date in March reads as this week.
      const dayDistance = Math.round((checkDay.getTime() - today.getTime()) / MS_PER_DAY);
      if (Math.abs(dayDistance) > WEEKDAY_ONLY_MAX_DAY_DISTANCE) {
        const dateFormat: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'numeric' };
        if (date.getFullYear() !== now.getFullYear()) {
          dateFormat.year = 'numeric';
        }
        return new Intl.DateTimeFormat(hass.locale.language, dateFormat).format(date);
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

/**
 * Narrows an untyped entity attribute to a string.
 *
 * `hass.states` is `Record<string, any>`, so every attribute an integration
 * reports arrives untyped. A malformed warning attribute (a number, an array,
 * an object) would otherwise be assigned straight into a warning and blow up in
 * the first string operation that touches it. Anything that is not a string is
 * therefore treated as absent, exactly like a missing attribute.
 *
 * @param value The raw attribute value.
 */
export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
