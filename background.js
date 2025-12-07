/**
 * Get the sitemap URL by checking common locations
 *
 * @param {string} hostname - The hostname of the website to check for a sitemap
 *
 * @returns {string|null} The URL of the sitemap if found, otherwise null
 */
// Compatibility: create `browser` alias when not present (minimal cross-browser support)
if (
  typeof globalThis.browser === "undefined" &&
  typeof globalThis.chrome !== "undefined"
) {
  globalThis.browser = globalThis.chrome;
}

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
async function parseSitemap(sitemapUrl) {
  // Try a normal fetch first; if it fails, the caller can try a page-context fetch
  try {
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    return parseSitemapFromText(text);
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Extract parsing logic into a separate function so we can parse text from any source
function parseSitemapFromText(text) {
  try {
    const urls = [];

    // Regex for extracting <url> entries
    const urlRegex = /<url>([\s\S]*?)<\/url>/g;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      const urlBlock = match[1];

      // Extract loc
      const locMatch = /<loc>(.*?)<\/loc>/i.exec(urlBlock);
      const loc = locMatch ? locMatch[1].trim() : "";

      // Extract lastmod
      const lastmodMatch = /<lastmod>(.*?)<\/lastmod>/i.exec(urlBlock);
      const lastmod = lastmodMatch ? lastmodMatch[1].trim() : "";

      if (loc) {
        urls.push({ loc, lastmod });
      }
    }

    if (urls.length === 0) {
      throw new Error("No se encontraron URL válidas en el sitemap");
    }

    return {
      success: true,
      urls: urls,
      count: urls.length,
      lastModified: urls.length > 0 ? urls[0].lastmod : "",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Page-context fetch fallback using scripting.executeScript
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
function isUrlInSitemap(currentUrl, sitemapUrls) {
  const cleanCurrentUrl = currentUrl.replace(/\/$/, "");

  for (let item of sitemapUrls) {
    const cleanSitemapUrl = item.loc.replace(/\/$/, "");
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
      allUrls: sitemapData.urls,
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
  if (request.action === "checkSitemap") {
    processSitemapRequest(request.url, request.tabId).then((result) => {
      // Delegate badge updates to the helper so behavior is consistent
      const tabId = request.tabId || (sender && sender.tab && sender.tab.id);
      updateBadgeFromResult(result, tabId);
      sendResponse(result);
    });

    return true; // Indicate that we will send a response asynchronously
  }
});

// --- Automatic badge update helpers and listeners ---
// Keep track of last-processed URL per tab to avoid redundant work
const lastProcessedUrlByTab = new Map();

function updateBadgeFromResult(result, tabId) {
  try {
    if (
      tabId != null &&
      !result.hasError &&
      result.status === "success" &&
      result.urlFound === false
    ) {
      chrome.action.setBadgeText({ text: "●", tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#FF0000", tabId });
    } else if (tabId != null) {
      chrome.action.setBadgeText({ text: "", tabId });
    }
  } catch (error) {
    console.error("Error setting badge:", error);
  }
}

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
  try {
    chrome.action.setBadgeText({ text: "", tabId });
  } catch (e) {
    // ignore
  }
});
