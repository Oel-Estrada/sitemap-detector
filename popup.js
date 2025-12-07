// DOM Elements
// Centralized constants for styling/class IDs used in injected scripts
const WARNING_BORDER_COLOR = "#f59e0b"; // Warning/amber color used for borders
const LINK_WARNING_STYLE_ID = "sitemap-detector-link-warning-style";
const LINK_WARNING_CLASS_NAME = "sitemap-detector-warning-link";
const loadingDiv = document.getElementById("loading");
const contentDiv = document.getElementById("content");
const statusSection = document.getElementById("status-section");
const statusBox = document.getElementById("status");
const statusText = document.getElementById("status-text");
const sitemapInfo = document.getElementById("sitemap-info");
const urlDetails = document.getElementById("url-details");
const nonIndexedSection = document.getElementById("nonindexed-list");
const nonIndexedContainer = document.getElementById("nonindexed-container");
const errorSection = document.getElementById("error-section");
const errorBox = document.getElementById("error");
const errorText = document.getElementById("error-text");
// Export controls
const exportBtn = document.getElementById("export-btn");
const exportResult = document.getElementById("export-result");
const exportOutput = document.getElementById("export-output");
const copyBtn = document.getElementById("copy-btn");
// Addons controls
const toggleHighlight = document.getElementById("toggle-highlight");

/**
 * Format a date string into a human‑readable Spanish string.
 *
 * @param {string} dateString - The date string to format.
 * @returns {string} The formatted date string.
 */
function formatDate(dateString) {
  if (!dateString) return "No especificada";
  const date = new Date(dateString);
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Render the status and info sections based on the background result.
 *
 * @param {Object} result - The result object from the background script.
 * @returns {void}
 */
function displayStatus(result) {
  contentDiv.classList.remove("hidden");
  loadingDiv.classList.add("hidden");

  if (result.hasError) {
    // Display error
    errorSection.classList.remove("hidden");
    statusSection.classList.add("hidden");
    sitemapInfo.classList.add("hidden");
    urlDetails.classList.add("hidden");

    errorText.textContent = result.message;
    errorBox.className = "error-box";
  } else {
    // Display sitemap information
    errorSection.classList.add("hidden");
    statusSection.classList.remove("hidden");
    sitemapInfo.classList.remove("hidden");

    // Update status box
    if (result.urlFound) {
      statusBox.className = "status-box found";
      statusText.innerHTML = "<strong>✓ URL encontrada en el sitemap</strong>";
    } else {
      statusBox.className = "status-box not-found";
      statusText.innerHTML =
        "<strong>✗ URL no encontrada en el sitemap</strong>";
    }

    // Display sitemap information
    document.getElementById("sitemap-url").textContent = result.sitemapUrl;
    document.getElementById("url-count").textContent = result.totalUrls;
    document.getElementById("last-mod").textContent = formatDate(
      result.lastModified
    );

    // If the URL was found, display details
    if (result.urlFound && result.urlDetails) {
      urlDetails.classList.remove("hidden");
      document.getElementById("url-location").textContent =
        result.urlDetails.loc;
      document.getElementById("url-lastmod").textContent = formatDate(
        result.urlDetails.lastmod
      );
    } else {
      urlDetails.classList.add("hidden");
    }

    // Display accumulated non-indexed URLs (from background)
    if (result.nonIndexedUrls && result.nonIndexedUrls.length > 0) {
      nonIndexedSection.classList.remove("hidden");
      displayNonIndexedList(result.nonIndexedUrls);
    } else {
      nonIndexedSection.classList.add("hidden");
      if (nonIndexedContainer) nonIndexedContainer.innerHTML = "";
    }
  }
}

/**
 * Render the list of non‑indexed URLs in the popup.
 *
 * @param {string[]} urls - Array of non‑indexed URLs.
 * @returns {void}
 */
function displayNonIndexedList(urls) {
  if (!nonIndexedContainer) return;

  // If no URLs, hide the entire section
  if (!urls || urls.length === 0) {
    nonIndexedSection.classList.add("hidden");
    nonIndexedContainer.innerHTML = "";
    return;
  }

  // Show the section if there are URLs
  nonIndexedSection.classList.remove("hidden");
  nonIndexedContainer.innerHTML = "";

  // Display up to 50 non-indexed URLs using a fragment
  const displayUrls = urls.slice(0, 50);
  const fragment = document.createDocumentFragment();
  for (const urlString of displayUrls) {
    const urlItem = document.createElement("div");
    urlItem.className = "url-item non-indexed-item";

    const linkSpan = document.createElement("span");
    linkSpan.style.flex = "1";
    const anchorEl = document.createElement("a");
    anchorEl.href = urlString;
    anchorEl.target = "_blank";
    anchorEl.textContent = urlString;
    linkSpan.appendChild(anchorEl);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Eliminar de la lista";
    deleteBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage(
        { action: "removeNonIndexedUrl", url: urlString, tabId: window._currentTabId },
        () => {
          // Refresh the list after deletion
          const updatedUrls = urls.filter((url) => url !== urlString);
          displayNonIndexedList(updatedUrls);
        }
      );
    });

    urlItem.appendChild(linkSpan);
    urlItem.appendChild(deleteBtn);
    fragment.appendChild(urlItem);
  }
  nonIndexedContainer.appendChild(fragment);

  if (urls.length > 50) {
    const moreItem = document.createElement("div");
    moreItem.className = "url-item";
    moreItem.style.textAlign = "center";
    moreItem.style.color = "var(--color-muted)";
    const emphasisEl = document.createElement("em");
    emphasisEl.textContent = `... y ${urls.length - 50} más`;
    moreItem.appendChild(emphasisEl);
    nonIndexedContainer.appendChild(moreItem);
  }
}

/**
 * Initialize the popup
 *
 * @returns {void}
 */
async function init() {
  loadingDiv.classList.remove("hidden");
  contentDiv.classList.add("hidden");

  // Get the current URL
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tabs[0].url;
  const tabId = tabs[0].id;
  // store current tabId for other actions
  window._currentTabId = tabId;
  window._currentUrl = currentUrl;

  // Send message to background to process the sitemap (include tabId for CORS fallback)
  chrome.runtime.sendMessage(
    { action: "checkSitemap", url: currentUrl, tabId },
    (response) => {
      displayStatus(response);
    }
  );

  // Initialize addons toggle state from storage and apply if needed
  try {
    const { highlightLinks } = await chrome.storage.local.get("highlightLinks");
    if (toggleHighlight) {
      toggleHighlight.checked = !!highlightLinks;
      if (toggleHighlight.checked) {
        applyLinkWarningBorder(tabId);
      } else {
        removeLinkWarningBorder(tabId);
      }
      toggleHighlight.addEventListener("change", async (event) => {
        const enabled = event.target.checked;
        await chrome.storage.local.set({ highlightLinks: enabled });
        if (enabled) {
          applyLinkWarningBorder(window._currentTabId);
        } else {
          removeLinkWarningBorder(window._currentTabId);
        }
      });
    }
  } catch (_) {
    // ignore storage issues silently
  }
}

// Initialize when the popup loads
init();

// Export button handler
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const tabId = window._currentTabId;
    chrome.runtime.sendMessage(
      { action: "exportNonIndexed", tabId },
      (resp) => {
        if (resp && resp.success) {
          exportOutput.value = resp.exportText || "";
          exportResult.classList.remove("hidden");
        } else {
          exportOutput.value = "";
          exportResult.classList.add("hidden");
          alert("No hay URLs para exportar");
        }
      }
    );
  });
}

/**
 * Apply a border highlight to same‑origin links that are NOT present in the sitemap.
 * The border color and class/style IDs are centralized via constants.
 *
 * @param {number} tabId - The tab ID where to apply the script.
 * @returns {void}
 */
function applyLinkWarningBorder(tabId) {
  if (!tabId) return;
  const pageUrl = window._currentUrl;
  if (!pageUrl) return;
  // Ask background for sitemap URLs of this domain
  chrome.runtime.sendMessage({ action: "getSitemapUrls", url: pageUrl, tabId }, (resp) => {
    if (!resp || !resp.success) {
      // If we cannot get sitemap, do nothing (no highlight)
      return;
    }
    const sitemapUrls = Array.isArray(resp.urls) ? resp.urls : [];
    chrome.scripting.executeScript({
      target: { tabId },
      func: (sitemapList, styleId, className, warningColor) => {
        try {
          let style = document.getElementById(styleId);
          if (!style) {
            style = document.createElement("style");
            style.id = styleId;
            style.textContent = `.${className} { border: 2px solid ${warningColor} !important; }`;
            document.documentElement.appendChild(style);
          }

          // Helper to normalize URL: origin+pathname without query/hash, strip trailing slash except root
          const normalize = (urlInput) => {
            try {
              const parsedUrl = new URL(urlInput, document.baseURI);
              let originAndPath = parsedUrl.origin + parsedUrl.pathname;
              if (originAndPath.length > 1) originAndPath = originAndPath.replace(/\/$/, "");
              return originAndPath;
            } catch {
              return "";
            }
          };

          const sameOrigin = window.location.origin;
          const sitemapSet = new Set(sitemapList || []);
          const links = document.querySelectorAll('a[href]');
          links.forEach((anchor) => {
            const hrefValue = anchor.getAttribute('href');
            const normalized = normalize(hrefValue);
            // Same-origin only
            if (!normalized || !normalized.startsWith(sameOrigin)) {
              anchor.classList.remove(className);
              return;
            }
            // If link is in sitemap, do not highlight
            if (sitemapSet.has(normalized)) {
              anchor.classList.remove(className);
            } else {
              anchor.classList.add(className);
            }
          });
        } catch (_) {
          // ignore
        }
      },
      args: [sitemapUrls, LINK_WARNING_STYLE_ID, LINK_WARNING_CLASS_NAME, WARNING_BORDER_COLOR],
    });
  });
}

/**
 * Remove the link highlight style and any applied classes from the page.
 *
 * @param {number} tabId - The tab ID where to remove the script side effects.
 * @returns {void}
 */
function removeLinkWarningBorder(tabId) {
  if (!tabId) return;
  chrome.scripting.executeScript({
    target: { tabId },
    func: (styleId, className) => {
      try {
        const style = document.getElementById(styleId);
        if (style && style.parentNode) style.parentNode.removeChild(style);
        // Also remove the class from any links
        document.querySelectorAll('.' + className).forEach((el) => el.classList.remove(className));
      } catch (_) {
        // ignore
      }
    },
    args: [LINK_WARNING_STYLE_ID, LINK_WARNING_CLASS_NAME]
  });
}

// Copy button handler
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(exportOutput.value || "");
      copyBtn.textContent = "Copiado";
      setTimeout(() => (copyBtn.textContent = "Copiar al portapapeles"), 1500);
    } catch (error) {
      alert("Error copiando al portapapeles");
    }
  });
}
