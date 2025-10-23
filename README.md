# NINA and DWD Warnings Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=flat-square)](https://github.com/hacs/integration)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/timmaurice/lovelace-nina-dwd-card?style=flat-square)
![GitHub downloads](https://img.shields.io/github/downloads/timmaurice/lovelace-nina-dwd-card/total?style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/timmaurice/lovelace-nina-dwd-card.svg?style=flat-square)
![GitHub code size](https://img.shields.io/github/languages/code-size/timmaurice/lovelace-nina-dwd-card.svg?style=flat-square)
![GitHub license](https://img.shields.io/github/license/timmaurice/lovelace-nina-dwd-card?style=flat-square)

A custom Lovelace card for Home Assistant to display warnings from NINA (Notfall-Informations- und Nachrichten-App) and DWD (Deutscher Wetterdienst) sensors.

## Features

- Displays current and advance warnings from NINA and DWD integrations.
- Consolidates warnings from multiple NINA binary sensors and DWD sensors into a single card.
- Color-coded headlines based on warning severity/level.
- Intelligently deduplicates warnings, prioritizing the original DWD alert over NINA rebroadcasts.
- Automatically sorts warnings by severity, displaying the most critical alerts first.
- Formats warning start and end times for readability.
- Shows a "No Warnings" message when no active warnings are present.
- Displays sender information for NINA warnings.
- Designed to be fully customizable through the visual editor (editor UI is a future enhancement).

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

| Name                    | Type    | Default      | Description                                                                                            |
| ----------------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `type`                  | string  | **Required** | `custom:nina-dwd-card`                                                                                 |
| `title`                 | string  | `(none)`     | The title of the card.                                                                                 |
| `nina_entity_prefix`    | string  | `(none)`     | The NINA warning area prefix, selected via the editor dropdown.                                        |
| `max_warnings`          | number  | `5`          | The maximum number of warnings to display on the card.                                                 |
| `dwd_device`            | string  | `(none)`     | A DWD Weather Warnings device. The card will find the `current` and `advance` warning sensors from it. |
| `dwd_map_land`          | string  | `(none)`     | The German state ("Bundesland") to display the DWD warning map for.                                    |
| `hide_when_no_warnings` | boolean | `false`      | Hides the entire card when there are no active warnings. The card remains visible in edit mode.        |

### Examples

```yaml
type: custom:nina-dwd-card
title: Warnings
nina_entity_prefix: binary_sensor.warning_berlin
max_warnings: 3
dwd_device: 1234567890abcdef1234567890abcdef # Device ID for "Berlin"
dwd_map_land: bbb # For Berlin, Brandenburg
hide_when_no_warnings: true
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
