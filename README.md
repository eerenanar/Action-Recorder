# UI Action Recorder

A Chrome extension that records your interactions on any web page and converts them into structured test steps with XPath locators — ready to export for manual or automated testing.

## Features

- **One-click recording** — Start/Stop recording from the extension popup
- **Smart element detection** — Automatically identifies buttons, dropdowns, checkboxes, inputs, tabs, links, and more
- **XPath generation** — Produces readable, unique XPath locators for each interaction using a multi-strategy approach (ID, text, aria-label, placeholder, data attributes, etc.)
- **Human-readable descriptions** — Each action is described in plain language (e.g. `"Submit" button clicked`, `"Email" field typed "test@example.com"`)
- **Bilingual UI** — Turkish (TR) and English (EN) support
- **Inline editing** — Edit step descriptions, XPath values, and expected results directly in the popup
- **Manual steps** — Insert custom steps between recorded actions
- **Element highlight** — Click the eye icon to visually highlight the element on the page using its XPath
- **Expected results** — Add expected outcomes per step for test case documentation

### Export Formats

| Format | Description |
|--------|-------------|
| **JSON** | Full structured export with XPath, timestamps, and metadata |
| **Text** | Plain text step list for quick documentation |
| **BrowserStack CSV** | Ready-to-import CSV format for BrowserStack Test Management |

## Installation

Since this extension is not published to the Chrome Web Store, install it manually:

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `ui-action-recorder` folder

## Usage

1. Click the extension icon in the Chrome toolbar
2. Click **Start Recording**
3. Interact with the web page (click buttons, fill forms, navigate, etc.)
4. Click **Stop Recording**
5. Open the saved session to review, edit, and add expected results
6. Export in your preferred format

## File Structure

```
ui-action-recorder/
├── manifest.json       # Chrome extension manifest (MV3)
├── background.js       # Service worker — session management & message routing
├── content.js          # Page-level script — event listeners, XPath generation
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic — session list, detail view, export handlers
├── popup.css           # Popup styles
├── i18n.js             # Internationalization (TR/EN)
└── icons/              # Extension icons (16x16, 48x48, 128x128)
```

## How XPath Generation Works

`content.js` uses a prioritized multi-strategy approach to generate the most stable and readable XPath:

1. Test attributes (`data-testid`, `data-cy`, `data-qa`)
2. ID + text/placeholder/aria-label combinations
3. Name attribute + text
4. Text-based XPath (`normalize-space()`)
5. Placeholder / aria-label / title attributes
6. Class + text combinations
7. SVG context resolution
8. Anchored positional fallback

## Supported Interactions

| Event | Description |
|-------|-------------|
| `click` | Single clicks on any element |
| `dblclick` | Double clicks |
| `input` | Text typed into fields (debounced 500ms) |
| `change` | Checkbox, radio, and select changes |
| `submit` | Form submissions |
| `keydown` | Enter, Tab, Escape, Delete, Backspace |
| `contextmenu` | Right-clicks |

## Permissions

| Permission | Reason |
|------------|--------|
| `activeTab` | Access the current tab to inject the content script |
| `storage` | Persist sessions and language preference locally |

## Tech Stack

- **Manifest V3** Chrome Extension
- Vanilla JavaScript (no build step, no dependencies)
- Chrome Extension APIs: `storage`, `runtime`, `tabs`
