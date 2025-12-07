/**
 * Get the sitemap URL by checking common locations
 *
 * @param {string} hostname - The hostname of the website to check for a sitemap
 *
 * @returns {string|null} The URL of the sitemap if found, otherwise null
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
      // Continuar con la siguiente URL
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
  try {
    const response = await fetch(sitemapUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
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
        urls.push({
          loc,
          lastmod,
        });
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
async function processSitemapRequest(tabUrl) {
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

    const sitemapData = await parseSitemap(sitemapUrl);

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
    processSitemapRequest(request.url).then((result) => {
      sendResponse(result);
    });

    return true; // Indicate that we will send a response asynchronously
  }
});
