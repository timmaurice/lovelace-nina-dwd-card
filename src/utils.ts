import { HomeAssistant, NinaWarning, DwdWarning } from './types';
import { localize } from './localize';

export const WARNING_PREFIX_REGEX = /^Amtliche (Unwetter)?warnung vor /i;

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
    const startStr = 'start' in warning ? warning.start : '';
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
