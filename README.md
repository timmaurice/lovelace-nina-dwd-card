# NINA and DWD Warnings Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=flat-square)](https://github.com/hacs/integration)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/timmaurice/lovelace-nina-dwd-card?style=flat-square)
![GitHub downloads](https://img.shields.io/github/downloads/timmaurice/lovelace-nina-dwd-card/total?style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/timmaurice/lovelace-nina-dwd-card.svg?style=flat-square)
![GitHub code size](https://img.shields.io/github/languages/code-size/timmaurice/lovelace-nina-dwd-card.svg?style=flat-square)
![GitHub license](https://img.shields.io/github/license/timmaurice/lovelace-nina-dwd-card?style=flat-square)

A custom Lovelace card for Home Assistant to display warnings from NINA (Notfall-Informations- und Nachrichten-App) and DWD (Deutscher Wetterdienst) sensors.

## Features

- Displays current and advance warnings from [NINA](https://www.home-assistant.io/integrations/nina/) and [DWD](https://www.home-assistant.io/integrations/dwd_weather_warnings/) integrations.
- Consolidates warnings from multiple NINA binary sensors and DWD sensors into a single card.
- **Context-aware icons**: DWD warnings display specific icons based on warning type (frost, thunderstorm, wind, rain, snow, etc.).
- Color-coded headlines based on warning severity/level.
- Intelligently deduplicates warnings:
  - Prioritizes the original DWD alert over NINA rebroadcasts.
  - Merges identical warnings (same headline, description, instruction) with different time ranges into a single entry with the earliest start and latest end time.
- Automatically sorts warnings by severity, displaying the most critical alerts first.
- Formats warning start and end times for readability.
- Shows a "No Warnings" message when no active warnings are present.
- Displays sender information for NINA warnings.
- Designed to be fully customizable through the visual editor.

## AI Translation

The card supports AI-powered translation of warning content using Home Assistant's `ai_task.generate_data` service.

**Important**: To use this feature, you need to:

1. Have an AI Task integration configured in Home Assistant (e.g., with Google Gemini or OpenAI)
2. Provide the `ai_entity_id` of your AI task entity (e.g., `ai_task.google_ai_task`)

### Setup

1.  **Enable Translation**: In the card editor, expand the "AI Translation" section and toggle "Enable Translation".
2.  **Configure Settings**:
    - **`translation_target`**: Target language for translation (selected from a dropdown of common European languages)
    - **`ai_entity_id`**: AI Task entity to use for translation (selected from a dropdown of available `ai_task` entities)

**Note**: The AI prompt is standardized and cannot be customized. It instructs the AI to return a JSON object with `headline`, `description`, and `instruction` keys.

**Note**: Translation happens asynchronously. You might see the original text briefly before the translation appears. Translations are cached for the duration of the session to minimize API calls.

## Localization

The editor is available in the following languages:

- English
- German

<details>
<summary>Contributing Translations</summary>

If you would like to contribute a new translation:

1.  Fork the repository on GitHub.
2.  In the `src/translation` directory, copy `en.json` and rename it to your language code (e.g., `fr.json` for French).
3.  Translate all the values in the new file.
4.  Submit a pull request with your changes.

</details>

![NINA and DWD Warnings Card Screenshot](https://raw.githubusercontent.com/timmaurice/lovelace-nina-dwd-card/main/image.png)

## Installation

### HACS (Recommended)

This card is available in the [Home Assistant Community Store (HACS)](https://hacs.xyz/).

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=timmaurice&repository=lovelace-nina-dwd-card&category=plugin" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store." /></a>

<details>
<summary>Manual Installation</summary>

1.  Download the `nina-dwd-card.js` file from the latest release.
2.  Place the `nina-dwd-card.js` file in your `config/www` directory.
3.  Add the resource reference to your Lovelace configuration under `Settings` -> `Dashboards` -> `...` -> `Resources`.
    - URL: `/local/nina-dwd-card.js`
    - Resource Type: `JavaScript Module`

You can now add the card to your dashboard.

</details>

## Configuration

| Name                        | Type    | Default      | Description                                                                                                                 |
| --------------------------- | ------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `type`                      | string  | **Required** | `custom:nina-dwd-card`                                                                                                      |
| `title`                     | string  | `(none)`     | The title of the card.                                                                                                      |
| `nina_entity_prefix`        | string  | `(none)`     | The NINA warning area prefix, selected via the editor dropdown.                                                             |
| `max_warnings`              | number  | `5`          | The maximum number of warnings to display on the card.                                                                      |
| `dwd_device`                | string  | `(none)`     | A DWD Weather Warnings device. The card will find the `current` and `advance` warning sensors from it.                      |
| `dwd_map_type`              | string  | `state`      | The type of DWD map to display. Can be `state` (by district) or `region`.                                                   |
| `dwd_map_land`              | string  | `de`         | The German state ("Bundesland") or region to display the DWD warning map for.                                               |
| `dwd_map_position`          | string  | `inside`     | The position of the DWD map. Can be `inside` the first warning, `above` or `below` all warnings, or `none` to hide the map. |
| `map_pin_zone` **(BETA)**   | string  | **Optional** | Entity ID of a Home Assistant zone (e.g., `zone.home`) to mark on the map. Only available when `dwd_map_type` is `state`.   |
| `show_map_without_warnings` | boolean | `false`      | Shows the map even when there are no warnings. Only works when `dwd_map_position` is `above` or `below`.                    |
| `hide_on_level_below`       | number  | `(none)`     | Filters out warnings that are below the selected severity threshold (e.g., 2 for Moderate).                                 |
| `hide_instructions`         | boolean | `false`      | Hides the recommended actions ("Handlungsempfehlungen") for each warning.                                                   |
| `hide_footer`               | boolean | `false`      | Hides the footer containing the source and info icon.                                                                       |
| `separate_advance_warnings` | boolean | `false`      | Displays current warnings and advance warnings in separate sections.                                                        |
| `suppress_warning_text`     | boolean | `false`      | Removes \"Amtliche (Unwetter)warnung vor\" and \"VORABINFORMATION UNWETTER vor\" from the headline.                         |
| `hide_when_no_warnings`     | boolean | `false`      | Hides the entire card when there are no active warnings. The card remains visible in edit mode.                             |
| `theme_mode`                | string  | `auto`       | Overrides the card's theme mode. Options: `auto`, `light`, `dark`.                                                          |
| `color_overrides`           | object  | `(none)`     | Overrides the default severity colors. Keys: `no_warning`, `minor`, `moderate`, `severe`, `extreme`.                        |

> [!NOTE]
> **Debug Mode**: The `debug_mode` option is not available in the visual editor. It can only be configured via YAML. When enabled, it displays an overlay showing the map padding areas and boundary coordinates, which is useful for fine-tuning map positioning.

### Examples

```yaml
type: custom:nina-dwd-card
title: Warnings
nina_entity_prefix: binary_sensor.warning_berlin
max_warnings: 3
dwd_device: 1234567890abcdef1234567890abcdef # Device ID for your DWD integration
dwd_map_land: de # For Germany
dwd_map_type: state
dwd_map_position: above
show_map_without_warnings: true # Keep map visible even without warnings
hide_on_level_below: 2 # Filters out warnings with level "Minor" (1)
hide_instructions: false
hide_footer: false
separate_advance_warnings: true
hide_when_no_warnings: true
theme_mode: auto
color_overrides:
  severe: '#ff0000'
  extreme: '#880e4f'
```

## Development

<details>
<summary>To contribute to the development, you'll need to set up a build environment.</summary>

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/timmaurice/lovelace-nina-dwd-card.git
    cd lovelace-nina-dwd-card
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Build the card:**
    This command will build for changes in the `src` directory and rebuild the card.

    ```bash
    npm run build
    ```

4.  In your Home Assistant instance, you will need to configure Lovelace to use the local development version of the card from `dist/nina-dwd-card.js`.
</details>

---

For further assistance or to [report issues](https://github.com/timmaurice/lovelace-nina-dwd-card/issues), please visit the [GitHub repository](https://github.com/timmaurice/lovelace-nina-dwd-card).

![Star History Chart](https://api.star-history.com/svg?repos=timmaurice/lovelace-nina-dwd-card&type=Date)

## ☕ Support My Work

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30" />](https://www.buymeacoffee.com/timmaurice)
