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

## How it works

1. The background service worker attempts to locate a sitemap by making `HEAD` requests to common sitemap paths.
2. If a sitemap is found, the worker fetches its XML contents and extracts `<url>` entries using a lightweight parser.
3. The extension compares the active tab URL with sitemap entries and returns the result to the popup for display.

## Limitations

- Only supports publicly accessible XML sitemaps (no authentication or robots-restricted sitemaps)
- The extension limits the preview to the first 20 sitemap entries to keep the UI responsive
- Parsing is done with a simple text-based extractor (works for well-formed sitemaps). Very large or non-standard sitemap formats may not parse correctly.

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
