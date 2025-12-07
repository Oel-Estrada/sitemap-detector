/**
 * Get the sitemap URL by checking common locations
 *
 * @param {string} hostname - The hostname of the website to check for a sitemap
 *
 * @returns {string|null} The URL of the sitemap if found, otherwise null
 */
// Compatibility: create `browser` alias when not present (minimal cross-browser support)
/**
 * Minimal cross‑browser alias. Ensures `browser` exists when only `chrome` is available.
 */
if (
  typeof globalThis.browser === "undefined" &&
  typeof globalThis.chrome !== "undefined"
) {
  globalThis.browser = globalThis.chrome;
}

// Centralized color references for UI elements controlled from background (no CSS vars available here)
// Keep these aligned with popup.css :root palette when possible.
const BADGE_BG_COLOR = "#f44336";   // matches --color-error
const BADGE_TEXT_COLOR = "#ffffff"; // matches --color-white

// Performance-related constants and caches
const MAX_SITEMAP_BYTES = 5 * 1024 * 1024; // 5 MB guard to avoid huge downloads
const SITEMAP_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** @type {Map<string, {text:string, fetchedAt:number}>} */
const sitemapCache = new Map(); // key: sitemapUrl
/** @type {Map<number, number>} */
const lastBadgeCount = new Map(); // tabId -> last count applied

/**
 * Update extension badge text and colors for a given tab.
 *
 * @param {number} tabId - Target tab ID.
 * @param {number} count - Count to display on the badge (0 clears it).
 * @returns {void}
 */
function updateBadge(tabId, count) {
  try {
    const prev = lastBadgeCount.get(tabId);
    if (prev === count) return; // avoid redundant API calls
    lastBadgeCount.set(tabId, count);

    const text = count && count > 0 ? String(count) : "";
    const badgeApi = (chrome && chrome.action) ? chrome.action : (chrome && chrome.browserAction) ? chrome.browserAction : null;
    if (badgeApi) {
      try { badgeApi.setBadgeText({ text, tabId }); } catch (_) { /* ignore */ }
      try { badgeApi.setBadgeBackgroundColor({ color: BADGE_BG_COLOR, tabId }); } catch (_) { /* ignore */ }
    }
    try {
      if (typeof chrome.action.setBadgeTextColor === "function") {
        chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR, tabId });
      } else if (
        chrome.browserAction &&
        typeof chrome.browserAction.setBadgeTextColor === "function"
      ) {
        chrome.browserAction.setBadgeTextColor({ color: BADGE_TEXT_COLOR, tabId });
      }
    } catch (_) {
      // ignore optional text-color errors
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Try to guess a sitemap URL by testing common endpoints on the given hostname.
 *
 * @param {string} hostname - Hostname to test.
 * @returns {Promise<string|null>} Resolved sitemap URL or null if not found.
 */
async function getSitemapUrl(hostname) {
  const possibleSitemapUrls = [
    `https://${hostname}/sitemap.xml`,
    `https://${hostname}/sitemap_index.xml`,
  ];

  for (let sitemapUrl of possibleSitemapUrls) {
    try {
      const response = await fetch(sitemapUrl, { method: "HEAD" });
      if (response.ok) {
        return sitemapUrl;
      }
    } catch (error) {
      // Ignore fetch errors for HEAD requests
    }
  }

  return null;
}

/**
 * Parse the sitemap XML and extract URLs and metadata
 *
 * @param {string} sitemapUrl - The URL of the sitemap to parse
 *
 * @returns {Object} An object containing the parsing result and URLs
 */
/**
 * Fetch and parse the sitemap at the provided URL, with caching and size guards.
 *
 * @param {string} sitemapUrl - Absolute sitemap URL.
 * @returns {Promise<Object>} Result object with success flag, urls, count, lastModified, and/or error.
 */
async function parseSitemap(sitemapUrl) {
  // Cache-first: return recent fetch to avoid repeated network
  const cached = sitemapCache.get(sitemapUrl);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < SITEMAP_CACHE_TTL_MS) {
    return parseSitemapFromText(cached.text);
  }

  // Try a normal fetch first; if it fails, the caller can try a page-context fetch
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
    const response = await fetch(sitemapUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_SITEMAP_BYTES) {
      throw new Error("Sitemap demasiado grande (límite 5MB)");
    }

    const text = await response.text();
    // basic size guard post-read (in case no content-length provided)
    if (text && text.length > MAX_SITEMAP_BYTES * 1.2) {
      throw new Error("Sitemap excede el tamaño permitido");
    }

    sitemapCache.set(sitemapUrl, { text, fetchedAt: now });
    return parseSitemapFromText(text);
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Extract parsing logic into a separate function so we can parse text from any source
/**
 * Parse a sitemap XML string into URL entries. Uses DOMParser when possible, with regex fallback.
 *
 * @param {string} text - Raw XML content.
 * @returns {Object} Object with success flag, urls list, count, lastModified, and/or error.
 */
function parseSitemapFromText(text) {
  // Helper: safe text extraction
  const getText = (node) => (node && typeof node.textContent === "string" ? node.textContent.trim() : "");

  try {
    // Prefer DOMParser when available (robust with whitespace, CDATA, namespaces)
    if (typeof DOMParser === "function") {
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "application/xml");

      // Detect parser errors (Firefox uses <parsererror>; Chrome sets documentElement to parsererror in some cases)
      const isParserError =
        !xml ||
        !xml.documentElement ||
        xml.documentElement.nodeName.toLowerCase() === "parsererror" ||
        xml.getElementsByTagName("parsererror").length > 0;

      if (!isParserError) {
        // Collect <url> nodes irrespective of namespaces using localName
        const allNodes = xml.getElementsByTagName("*");
        const urlNodes = [];
        for (let i = 0; i < allNodes.length; i++) {
          if (allNodes[i].localName === "url") urlNodes.push(allNodes[i]);
        }

        const urls = [];
        for (const urlNode of urlNodes) {
          // Find <loc> and <lastmod> among children by localName
          let loc = "";
          let lastmod = "";
          for (let i = 0; i < urlNode.childNodes.length; i++) {
            const child = urlNode.childNodes[i];
            if (!child || child.nodeType !== 1) continue; // element nodes only
            if (child.localName === "loc") loc = getText(child);
            else if (child.localName === "lastmod") lastmod = getText(child);
          }
          if (loc) urls.push({ loc, lastmod });
        }

        if (urls.length > 0) {
          return {
            success: true,
            urls,
            count: urls.length,
            lastModified: urls.length > 0 ? urls[0].lastmod : "",
          };
        }
        // If XML parsed but no <url> entries, continue to regex fallback below
      }
      // If parser error, fall through to regex fallback
    }
  } catch (_) {
    // If DOMParser path fails for any reason, fall back to regex
  }

  // Fallback: legacy regex-based parsing (works for simple sitemaps)
  try {
    const urls = [];
    const urlRegex = /<url>([\s\S]*?)<\/url>/g;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      const urlBlock = match[1];
      const locMatch = /<loc>(.*?)<\/loc>/i.exec(urlBlock);
      const loc = locMatch ? locMatch[1].trim() : "";
      const lastmodMatch = /<lastmod>(.*?)<\/lastmod>/i.exec(urlBlock);
      const lastmod = lastmodMatch ? lastmodMatch[1].trim() : "";
      if (loc) urls.push({ loc, lastmod });
    }

    if (urls.length === 0) {
      throw new Error("No se encontraron URL válidas en el sitemap");
    }

    return {
      success: true,
      urls,
      count: urls.length,
      lastModified: urls.length > 0 ? urls[0].lastmod : "",
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Page-context fetch fallback using scripting.executeScript
/**
 * Fallback to fetch sitemap content within the page context (bypassing CORS in background).
 *
 * @param {string} sitemapUrl - Absolute URL to fetch.
 * @param {number} tabId - Tab ID used for `scripting.executeScript` target.
 * @returns {Promise<Object>} Result object with success flag and text or error.
 */
async function pageFetchSitemap(sitemapUrl, tabId) {
  if (!tabId) {
    return {
      success: false,
      error: "No tabId provided for page-context fallback",
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (url) => {
        try {
          const resp = await fetch(url);
          if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
          const text = await resp.text();
          return { success: true, text };
        } catch (e) {
          return {
            success: false,
            error: e && e.message ? e.message : String(e),
          };
        }
      },
      args: [sitemapUrl],
    });

    if (!results || results.length === 0) {
      return { success: false, error: "No result from page fetch" };
    }

    return results[0].result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if the current URL is present in the sitemap URLs
 *
 * @param {string} currentUrl - The current URL
 * @param {Array} sitemapUrls - The list of URLs from the sitemap
 *
 * @returns {Object|null} The sitemap URL object if found, otherwise null
 */
/**
 * Determine whether a given URL (sans params/fragments) exists within the sitemap URLs.
 *
 * @param {string} currentUrl - The URL to check.
 * @param {Array<Object>} sitemapUrls - Parsed sitemap URL entries.
 * @returns {Object|null} Matching entry or null.
 */
function isUrlInSitemap(currentUrl, sitemapUrls) {
  // Remove query parameters and fragments, then remove trailing slashes
  const cleanCurrentUrl = removeUrlParameters(currentUrl).replace(/\/$/, "");

  for (let item of sitemapUrls) {
    const cleanSitemapUrl = removeUrlParameters(item.loc).replace(/\/$/, "");
    if (cleanSitemapUrl === cleanCurrentUrl) {
      return item;
    }
  }

  return null;
}

/**
 * Process the sitemap request for a given tab URL
 *
 * @param {string} tabUrl - The URL of the current tab
 *
 * @returns {Object} The result object containing sitemap information
 */
/**
 * Resolve sitemap for the tab URL, parse it (with fallback), and evaluate presence of the tab URL.
 *
 * @param {string} tabUrl - Current tab URL.
 * @param {number} tabId - Current tab ID (used for page-context fallback).
 * @returns {Promise<Object>} Result with status, hasError, message, and sitemap info.
 */
async function processSitemapRequest(tabUrl, tabId) {
  try {
    const url = new URL(tabUrl);
    const hostname = url.hostname;
    const sitemapUrl = await getSitemapUrl(hostname);

    if (!sitemapUrl) {
      return {
        status: "error",
        message: "No se encontró un sitemap en este sitio",
        hasError: true,
      };
    }

    let sitemapData = await parseSitemap(sitemapUrl);

    // If direct fetch failed (likely CORS), try page-context fallback when tabId is available
    if (!sitemapData.success && tabId) {
      const pageFetchResult = await pageFetchSitemap(sitemapUrl, tabId);
      if (pageFetchResult && pageFetchResult.success && pageFetchResult.text) {
        sitemapData = parseSitemapFromText(pageFetchResult.text);
      }
    }

    if (!sitemapData.success) {
      return {
        status: "error",
        message: `Error al leer el sitemap: ${sitemapData.error}`,
        hasError: true,
      };
    }

    const urlInSitemap = isUrlInSitemap(tabUrl, sitemapData.urls);

    return {
      status: "success",
      currentUrl: tabUrl,
      sitemapUrl: sitemapUrl,
      urlFound: !!urlInSitemap,
      urlDetails: urlInSitemap,
      totalUrls: sitemapData.count,
      lastModified: sitemapData.lastModified,
      hasError: false,
    };
  } catch (error) {
    return {
      status: "error",
      message: error.message,
      hasError: true,
    };
  }
}

/**
 * Listen for messages from popup.js to process sitemap checks
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Provide normalized sitemap URL list for the given page URL
  if (request.action === "getSitemapUrls") {
    (async () => {
      try {
        const tabUrl = request.url;
        const tabId = request.tabId || (sender && sender.tab && sender.tab.id);
        if (!tabUrl) {
          sendResponse({ success: false, error: "No URL provided" });
          return;
        }

        const url = new URL(tabUrl);
        const hostname = url.hostname;
        const sitemapUrl = await getSitemapUrl(hostname);
        if (!sitemapUrl) {
          sendResponse({ success: false, error: "No sitemap found" });
          return;
        }

        let sitemapData = await parseSitemap(sitemapUrl);
        if (!sitemapData.success && tabId) {
          const pageFetchResult = await pageFetchSitemap(sitemapUrl, tabId);
          if (pageFetchResult && pageFetchResult.success && pageFetchResult.text) {
            sitemapData = parseSitemapFromText(pageFetchResult.text);
          }
        }

        if (!sitemapData.success) {
          sendResponse({ success: false, error: sitemapData.error || "Parse error" });
          return;
        }

        // Normalize to origin+pathname without trailing slash (except root)
        const normalized = [];
        for (const item of sitemapData.urls) {
          try {
            const urlObject = new URL(item.loc);
            const core = urlObject.origin + urlObject.pathname;
            let clean = removeUrlParameters(core);
            // remove trailing slash except for root
            if (clean.length > 1) clean = clean.replace(/\/$/, "");
            normalized.push(clean);
          } catch (_) {
            // skip invalid URL
          }
        }

        sendResponse({ success: true, urls: normalized });
      } catch (e) {
        sendResponse({ success: false, error: e && e.message ? e.message : String(e) });
      }
    })();

    return true; // async response
  }
  // Remove a non-indexed URL from the list
  if (request.action === "removeNonIndexedUrl") {
    const tabId = request.tabId || (sender && sender.tab && sender.tab.id);
    const url = request.url;
    removeNonIndexedUrl(tabId, url);
    sendResponse({ success: true });
    return false; // response sent synchronously
  }

  // Export non-indexed URLs as sitemap <url> blocks
  if (request.action === "exportNonIndexed") {
    const tabId = request.tabId || (sender && sender.tab && sender.tab.id);
    const text = exportNonIndexedUrls(tabId, request.lastmod);
    sendResponse({ success: true, exportText: text });

    return false; // response sent synchronously
  }

  if (request.action === "checkSitemap") {
    processSitemapRequest(request.url, request.tabId).then((result) => {
      // Delegate badge updates to the helper so behavior is consistent
      const tabId = request.tabId || (sender && sender.tab && sender.tab.id);
      updateBadgeFromResult(result, tabId);
      // Include current non-indexed list for the tab so popup can display it
      result.nonIndexedUrls = getNonIndexedList(tabId);
      sendResponse(result);
    });

    return true; // Indicate that we will send a response asynchronously
  }
});

// --- Automatic badge update helpers and listeners ---
// Keep track of last-processed URL per tab to avoid redundant work
const lastProcessedUrlByTab = new Map();

// Keep track of non-indexed URLs per tab (tabId -> Set of URLs)
const nonIndexedByTab = new Map();

/**
 * Remove query parameters and fragments from a URL.
 *
 * @param {string} url - The URL to clean.
 * @returns {string} URL without query parameters or fragments.
 */
function removeUrlParameters(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    // Fallback: simple string split if URL parsing fails
    return url.split("?")[0].split("#")[0];
  }
}

/**
 * Add a non‑indexed URL to the tracking set for a given tab and update the badge.
 *
 * @param {number} tabId - The ID of the tab.
 * @param {string} url - The URL to add.
 * @returns {void}
 */
function addNonIndexedUrl(tabId, url) {
  try {
    if (!tabId || !url) return;
    // Remove query parameters and fragments before storing
    const cleanUrl = removeUrlParameters(url);

    let set = nonIndexedByTab.get(tabId);
    if (!set) {
      set = new Set();
      nonIndexedByTab.set(tabId, set);
    }
    set.add(cleanUrl);

    const count = set.size;
    updateBadge(tabId, count);
  } catch (e) {
    console.error("Error adding non-indexed URL:", e);
  }
}

/**
 * Remove a non‑indexed URL from the tracking set for a given tab and update the badge.
 *
 * @param {number} tabId - The ID of the tab.
 * @param {string} url - The URL to remove.
 * @returns {void}
 */
function removeNonIndexedUrl(tabId, url) {
  try {
    if (!tabId) return;
    const set = nonIndexedByTab.get(tabId);
    if (!set) return;
    // Clean URL parameters before removing
    if (url) set.delete(removeUrlParameters(url));

    if (set.size === 0) {
      nonIndexedByTab.delete(tabId);
      updateBadge(tabId, 0);
    } else {
      updateBadge(tabId, set.size);
    }
  } catch (error) {
    console.error("Error removing non-indexed URL:", error);
  }
}

/**
 * Get the list of non‑indexed URLs for a given tab.
 *
 * @param {number} tabId - The ID of the tab.
 * @returns {Array<string>} The list of non‑indexed URLs.
 */
function getNonIndexedList(tabId) {
  const set = nonIndexedByTab.get(tabId);
  return set ? Array.from(set) : [];
}

/**
 * Export non‑indexed URLs for a tab as sitemap <url> blocks.
 *
 * @param {number} tabId - The tab id whose non‑indexed list to export.
 * @param {string} lastmodInput - Optional date string (e.g., YYYY‑MM‑DD). If invalid, today's date is used.
 * @returns {string} XML fragment containing <url> entries (no wrapper).
 */
function exportNonIndexedUrls(tabId, lastmodInput) {
  const set = nonIndexedByTab.get(tabId);
  if (!set || set.size === 0) return "";

  // Helper to produce timestamp like: 2025-05-13T22:21:07+00:00
  function formatWithOffset(d) {
    // Use UTC time and append +00:00
    // Remove milliseconds and trailing Z
    return d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
  }

  let lastmodTimestamp = null;
  if (lastmodInput) {
    const parsed = new Date(lastmodInput);
    if (!isNaN(parsed.getTime())) {
      lastmodTimestamp = formatWithOffset(parsed);
    }
  }
  if (!lastmodTimestamp) lastmodTimestamp = formatWithOffset(new Date());

  const urls = Array.from(set);
  const entries = urls
    .map((urlString) => {
      return [
        "    <url>",
        `      <loc>${urlString}</loc>`,
        `      <lastmod>${lastmodTimestamp}</lastmod>`,
        "    </url>",
      ].join("\n");
    })
    .join("\n");

  return entries;
}

/**
 * Update badge and non‑indexed list based on a result from processing a sitemap request.
 *
 * @param {any} result - Result object from processSitemapRequest.
 * @param {number} tabId - Tab ID to update.
 * @returns {void}
 */
function updateBadgeFromResult(result, tabId) {
  try {
    // If URL is not found in the sitemap, add it to the non-indexed set for the tab
    if (
      tabId != null &&
      !result.hasError &&
      result.status === "success" &&
      result.urlFound === false
    ) {
      addNonIndexedUrl(tabId, result.currentUrl);

      // Nothing else to do here (badge updated by addNonIndexedUrl)
    } else if (
      tabId != null &&
      !result.hasError &&
      result.status === "success" &&
      result.urlFound === true
    ) {
      // If URL is found in sitemap, ensure it's removed from the non-indexed set
      removeNonIndexedUrl(tabId, result.currentUrl);
    } else if (tabId != null) {
      // For other cases (errors or unknown), keep existing non-indexed list but
      // clear badge if no entries remain
      const count = nonIndexedByTab.get(tabId)
        ? nonIndexedByTab.get(tabId).size
        : 0;
      updateBadge(tabId, count);
    }
  } catch (error) {
    console.error("Error setting badge:", error);
  }
}

/**
 * When a tab's URL changes or finishes loading, process it and update badge state.
 *
 * @param {number} tabId - Tab ID.
 * @param {string} url - Tab URL.
 * @returns {Promise<void>}
 */
async function checkTabAndUpdate(tabId, url) {
  if (!url || !/^https?:\/\//i.test(url)) return;

  const last = lastProcessedUrlByTab.get(tabId);
  if (last === url) return; // no change
  lastProcessedUrlByTab.set(tabId, url);

  try {
    const result = await processSitemapRequest(url, tabId);
    updateBadgeFromResult(result, tabId);
  } catch (e) {
    console.error("Error processing sitemap for tab:", e);
  }
}

// When a tab completes loading (or its URL changes), run the check
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If the URL changed or the load completed, check sitemap
  if (changeInfo.url) {
    checkTabAndUpdate(tabId, changeInfo.url);
  } else if (changeInfo.status === "complete") {
    const url = (tab && tab.url) || null;
    checkTabAndUpdate(tabId, url);
  }
});

// When switching active tabs, check the newly active tab
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    checkTabAndUpdate(activeInfo.tabId, tab.url);
  });
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  lastProcessedUrlByTab.delete(tabId);
  nonIndexedByTab.delete(tabId);
  lastBadgeCount.delete(tabId);
  try {
    updateBadge(tabId, 0);
  } catch (error) {
    // Ignore errors
  }
});
