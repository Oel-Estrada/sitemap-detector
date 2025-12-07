# Sitemap Detector — Chrome Extension

A lightweight Chrome extension that detects whether the current page URL appears in the site's XML sitemap and displays sitemap metadata and a preview of listed URLs.

## Features

- Detects common sitemap locations (`/sitemap.xml`, `/sitemap_index.xml`) automatically
- Parses sitemap XML and extracts URLs and `lastmod` metadata
- Checks whether the active tab URL is present in the sitemap
- Shows sitemap URL, total number of URLs, last modified date, and previews the first 20 URLs
- Simple popup UI with clear success/error states

## Installation

### Manual (Developer Mode)

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked" and select this project folder

The extension will load and an icon will appear in the toolbar.

## Usage

1. Navigate to any website in Chrome.
2. Click the extension icon in the toolbar.
3. The popup will attempt to locate the site's sitemap, parse it, and display:
   - Whether the current URL is listed in the sitemap
   - Detected sitemap URL
   - Total URLs found and sitemap last modification date
   - First 20 URLs from the sitemap (with `lastmod` where available)

## Project files

```
├── manifest.json        # Extension manifest and permissions
├── popup.html           # Popup UI
├── popup.css            # Popup styles
├── popup.js             # Popup UI logic
├── background.js        # Service worker: sitemap detection & parsing
├── images/              # Icons (place your icon files here)
└── README.md            # This file
```

## Color palette (change colors in one place)

The UI uses centralized CSS variables in `:root` inside `popup.css`. Changing these values lets you update the entire theme from a single place.

Example (excerpt from `popup.css`):

```
:root {
  --color-primary: #667eea;
  --color-secondary: #764ba2;
  --color-text: #333333;
  --color-surface: #f5f5f5;
  --color-surface-contrast: #ffffff;
  --color-border: #dddddd;
  --color-border-soft: #eeeeee;
  --color-border-strong: #cccccc;
  --color-muted: #999999;
  --color-link: var(--color-primary);
  /* States */
  --color-success: #4caf50;          /* success border/state */
  --color-success-bg: #e8f5e9;       /* success background */
  --color-error: #f44336;            /* error border/state */
  --color-error-bg: #ffebee;         /* error background */
  --color-warning: #ff9800;          /* warning border/state */
  --color-warning-bg: #fff3e0;       /* warning background */
  /* Gradients (app background and primary button) */
  --gradient-app-start: #667eea;
  --gradient-app-end: #764ba2;
  --gradient-btn-primary-start: #6c5ce7;
  --gradient-btn-primary-end: #5a4bd6;
}
```

How to change the primary color:

1. Open `popup.css`.
2. In the `:root` section, modify `--color-primary` and, if you want, `--gradient-app-*` to adjust the background gradient.
3. Save and reload the extension at `chrome://extensions/`.

Tip: if you want a dark theme later, you can create an alternative block (for example, with a `.theme-dark` class on `<body>`) redefining these variables.

## How it works

1. The background service worker attempts to locate a sitemap by making `HEAD` requests to common sitemap paths.
2. If a sitemap is found, the worker fetches its XML contents and extracts `<url>` entries using a lightweight parser.
3. The extension compares the active tab URL with sitemap entries and returns the result to the popup for display.

## Limitations

- Only supports publicly accessible XML sitemaps (no authentication or robots-restricted sitemaps)
- The extension limits the preview to the first 20 sitemap entries to keep the UI responsive
- Parsing is done with a simple text-based extractor (works for well-formed sitemaps). Very large or non-standard sitemap formats may not parse correctly.

## Cross-browser compatibility

- Manifest: This extension uses Manifest V3 which is supported by Chromium-based browsers (Chrome, Edge, Brave, Opera). Firefox has added MV3 support in recent versions but there are behavioral differences; the project includes a minimal `browser_specific_settings` entry to help Firefox identify the add-on and require a recent Gecko version.
- Firefox install: to load temporarily for testing open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and select the `manifest.json` file from this project. Use Firefox 109+ for better MV3 service worker support.
- Chrome/Edge install: open `chrome://extensions/` (or `edge://extensions/`), enable Developer mode, click "Load unpacked" and select this project folder.

## CORS and sitemap fetching

- The background service worker performs `HEAD` and `GET` requests to common sitemap locations. Some sites explicitly block cross-origin requests to their sitemap files with CORS restrictions. When that happens the extension cannot read the sitemap from the service worker directly.
- Recommended fallback (not implemented by default): perform the fetch from the page context using `scripting.executeScript` (or a content script) so the request originates from the page's origin; the page can then relay the sitemap contents back to the service worker. This approach is more complex and was left as an optional enhancement to preserve user privacy and code simplicity.
- Avoid using third-party proxies to bypass CORS in production because it exposes the user's browsing target and content to the proxy provider.

## Permissions

- `activeTab` — to read the active tab URL
- `scripting` — included in the manifest for compatibility with potential future content scripts
- `fetch` / host permissions (`<all_urls>`) — to request sitemap files from sites

## Development

If you want to iterate on the extension:

1. Make changes to the source files.
2. Reload the extension at `chrome://extensions/` (click the reload button for the extension).
3. Test by opening sites with sitemaps and opening the popup.

Suggested improvements:

- Add caching for fetched sitemaps to reduce repeated network requests
- Add a settings option to customize sitemap paths to check
- Add CSV/JSON export for sitemap entries

## Troubleshooting

- If the extension reports "No sitemap found", check manually whether `https://<site>/sitemap.xml` is reachable in the browser.
- If parsing fails, the sitemap may use a non-standard structure or be extremely large.

## License

This project is provided as-is and may be modified or redistributed.

---

**Version:** 1.0.0  
**Last updated:** December 2025
