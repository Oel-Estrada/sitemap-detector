// DOM Elements
const loadingDiv = document.getElementById("loading");
const contentDiv = document.getElementById("content");
const statusSection = document.getElementById("status-section");
const statusBox = document.getElementById("status");
const statusText = document.getElementById("status-text");
const sitemapInfo = document.getElementById("sitemap-info");
const urlDetails = document.getElementById("url-details");
const sitemapList = document.getElementById("sitemap-list");
const urlsContainer = document.getElementById("urls-container");
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
// (removed duplicate exportLastmod reference)

/**
 * Function to format dates
 *
 * @param {string} dateString - The date string to format
 *
 * @returns {string} The formatted date string
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
 * Function to display the status information
 *
 * @param {Object} result - The result object from the background script
 *
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
    sitemapList.classList.add("hidden");

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

    // Display list of URLs
    if (result.allUrls && result.allUrls.length > 0) {
      sitemapList.classList.remove("hidden");
      displayUrlsList(result.allUrls);
    } else {
      sitemapList.classList.add("hidden");
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
 * Display a list of URLs
 *
 * @param {Array} urls - The list of URL objects to display
 *
 * @returns {void}
 */
function displayUrlsList(urls) {
  urlsContainer.innerHTML = "";

  // Display first 20 URLs
  const displayUrls = urls.slice(0, 20);

  displayUrls.forEach((item, index) => {
    const urlItem = document.createElement("div");
    urlItem.className = "url-item";
    let html = `<a href="${item.loc}" target="_blank">${item.loc}</a>`;

    if (item.lastmod) {
      html += '<div class="url-meta">';
      html += `<div>Actualización: ${formatDate(item.lastmod)}</div>`;
      html += "</div>";
    }

    urlItem.innerHTML = html;
    urlsContainer.appendChild(urlItem);
  });

  // Display message if there are more than 20 URLs
  if (urls.length > 20) {
    const moreItem = document.createElement("div");
    moreItem.className = "url-item";
    moreItem.style.textAlign = "center";
    moreItem.style.color = "#999";
    moreItem.innerHTML = `<em>... y ${urls.length - 20} URLs más</em>`;
    urlsContainer.appendChild(moreItem);
  }
}

function displayNonIndexedList(urls) {
  if (!nonIndexedContainer) return;
  nonIndexedContainer.innerHTML = "";

  // Display up to 50 non-indexed URLs
  const displayUrls = urls.slice(0, 50);
  displayUrls.forEach((u) => {
    const urlItem = document.createElement("div");
    urlItem.className = "url-item";
    urlItem.innerHTML = `<a href="${u}" target="_blank">${u}</a>`;
    nonIndexedContainer.appendChild(urlItem);
  });

  if (urls.length > 50) {
    const moreItem = document.createElement("div");
    moreItem.className = "url-item";
    moreItem.style.textAlign = "center";
    moreItem.style.color = "#999";
    moreItem.innerHTML = `<em>... y ${urls.length - 50} más</em>`;
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

  // Send message to background to process the sitemap (include tabId for CORS fallback)
  chrome.runtime.sendMessage(
    { action: "checkSitemap", url: currentUrl, tabId },
    (response) => {
      displayStatus(response);
    }
  );
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

// Copy button handler
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(exportOutput.value || "");
      copyBtn.textContent = "Copiado";
      setTimeout(() => (copyBtn.textContent = "Copiar al portapapeles"), 1500);
    } catch (e) {
      alert("Error copiando al portapapeles");
    }
  });
}
