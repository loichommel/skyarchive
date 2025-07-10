// --- Global Configuration ---
const MAX_FEATURED_PANORAMAS = 6;
const MAX_FEATURED_ASTROPHOTOS = 5;
let currentLanguage = localStorage.getItem('language') || 'en';
let translations = {};

// --- Translation Functions ---
async function loadTranslations(lang) {
    try {
        const response = await fetch(`locales/${lang}.json`);
        if (!response.ok) {
            console.error(`Failed to load translations for ${lang}: ${response.statusText}`);
            // Fallback to English if the selected language file fails to load
            if (lang !== 'en') {
                await loadTranslations('en');
            }
            return;
        }
        translations = await response.json();
        applyTranslations();
    } catch (error) {
        console.error(`Error loading translations for ${lang}:`, error);
        // Fallback to English if there's an error
        if (lang !== 'en') {
            await loadTranslations('en');
        }
    }
}

function applyTranslations() {
    document.querySelectorAll('[data-translate-key]').forEach(element => {
        const key = element.getAttribute('data-translate-key');
        const attributeToTranslate = element.getAttribute('data-translate-attr');

        if (translations[key]) {
            if (attributeToTranslate) {
                // Translate a specified attribute (e.g., title, alt, aria-label)
                element.setAttribute(attributeToTranslate, translations[key]);
            } else {
                // Default to translating textContent
                // Make the childNodes check more specific to avoid unintended consequences
                if (element.childNodes.length > 1 && element.firstChild.nodeType === Node.TEXT_NODE && element.querySelector('i.fas.fa-caret-down')) {
                    element.firstChild.textContent = translations[key] + ' '; // Add space for caret, specific to nav dropdowns
                } else {
                    // For HTML content that might include tags like <i> for icons within a translatable string.
                    // If the translation value is expected to be HTML, use innerHTML.
                    // Otherwise, for plain text, textContent is safer.
                    // Assuming translations are plain text for now unless a specific need for HTML arises.
                    // For example, if a key like map.legend.description1 contains <i> tags, this would strip them.
                    // The current translation files seem to be plain text, but the description1 key includes <i> tags in the HTML.
                    // This needs careful handling. If translations can contain HTML, innerHTML is needed for those.
                    // For now, let's assume translations are text, and HTML in source is preserved if not part of the key.
                    // The current problem is that `map.legend.description1` in `index.html` has HTML tags INSIDE the <p>
                    // and the key `map.legend.description1` in `en.json` also CONTAINS these HTML tags.
                    // In this specific case, using .innerHTML for this key would be appropriate.
                    // Generalizing this is hard. A specific attribute like `data-translate-type="html"` could be used.
                    // Or, if a translation string starts with '<' and ends with '>', assume it's HTML.

                    // Let's refine the logic: if the key is one of those known to contain HTML, use innerHTML.
                    const keysWithHtml = ["map.legend.description1"]; // Add other keys if they also contain HTML
                    if (keysWithHtml.includes(key)) {
                        element.innerHTML = translations[key];
                    } else {
                        element.textContent = translations[key];
                    }
                }
            }
        } else {
            // console.warn(`Translation key not found: ${key}`); // Optional: for debugging
        }
    });
    // Update the language attribute of the html tag
    document.documentElement.lang = currentLanguage;
    updateLanguageSwitcherDisplay();
}

function setLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', currentLanguage);
    loadTranslations(currentLanguage);
}

function updateLanguageSwitcherDisplay() {
    const currentLangDisplay = document.getElementById('currentLangDisplay');
    if (currentLangDisplay) {
        currentLangDisplay.textContent = currentLanguage.toUpperCase();
    }
}

// --- Global/UI Functions ---
function viewPanorama(title, date, sqm, panoramaUrl, sqmFileUrl, latitude, longitude) {
    if (!panoramaUrl || panoramaUrl === 'about:blank') {
        console.error("Cannot navigate to panorama viewer: Panorama URL is missing or invalid.");
        alert("Sorry, the panorama image for this location is not available.");
        return;
    }
    const params = new URLSearchParams();
    params.set('panoramaUrl', panoramaUrl);
    if (title) params.set('title', title);
    if (date) params.set('date', date);
    if (sqm) params.set('sqm', sqm);
    if (sqmFileUrl) params.set('sqmFileUrl', sqmFileUrl);
    if (latitude) params.set('lat', latitude);
    if (longitude) params.set('lon', longitude);
    const viewerUrl = `panorama-viewer.html?${params.toString()}`;
    console.log("Navigating to panorama viewer:", viewerUrl);
    window.location.href = viewerUrl;
}

async function handleSkyComparisonCardClick(event) {
    const card = event.currentTarget;
    const dataset = card.dataset;
    const title = dataset.title;
    const date = dataset.date;
    const panoramaUrl = dataset.panoramaUrl;
    const sqmFileUrl = dataset.sqmFileUrl;
    const latitude = parseFloat(dataset.latitude);
    const longitude = parseFloat(dataset.longitude);

    if (!sqmFileUrl) {
        console.warn("SQM file URL missing for this card. Opening panorama without SQM value.");
        viewPanorama(title, date, '', panoramaUrl, sqmFileUrl, latitude, longitude);
        return;
    }
    try {
        const sqmData = await SkyArchiveDataService.fetchAndParseSqm(sqmFileUrl);
        const medianSqmValue = sqmData && sqmData.medianSqm !== null ? sqmData.medianSqm.toFixed(2) : '';
        viewPanorama(title, date, medianSqmValue, panoramaUrl, sqmFileUrl, latitude, longitude);
    } catch (error) {
        console.error("Error fetching or processing SQM data for sky comparison card:", error);
        viewPanorama(title, date, '', panoramaUrl, sqmFileUrl, latitude, longitude);
    }
}

function initSkyComparisonCardLinks() {
    const skyCards = document.querySelectorAll('.sky-comparison-grid .sky-image-card');
    skyCards.forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', handleSkyComparisonCardClick);
    });
}

// --- Main UI Initialization Logic (called by DataService after data is loaded) ---
function initializeUI(allData) {
    console.log("Initializing UI with all data:", allData);
    const { panoData, astroData } = allData;
    clearStaticContent(); // Clears dynamic content areas

    // Clear any global error messages when UI is attempting to initialize
    const globalErrorContainer = document.getElementById('global-error-message-container');
    if (globalErrorContainer) {
        globalErrorContainer.style.display = 'none';
        globalErrorContainer.textContent = '';
    }

    const featuredPanoData = panoData.filter(item => item.isFeatured);

    // Initialize Map (if map element exists)
    if (document.getElementById('lightPollutionMap')) {
        console.log("Initializing map via MapService...");
        if (typeof SkyArchiveMapService !== 'undefined' && typeof SkyArchiveMapService.initMap === 'function') {
            SkyArchiveMapService.initMap(panoData);
        } else {
            console.error("SkyArchiveMapService is not available. Map will not be initialized.");
        }
    }

    // Initialize Featured Visualizations (if elements exist)
    if (document.getElementById('featuredSqmHistogram') && document.getElementById('featuredPolarPlotContainer')) {
        console.log("Initializing featured visualizations via VisualizationService...");
        initFeaturedVisualizations(featuredPanoData);
    }

    // Initialize Galleries and Sliders via GalleryService (if service is available)
    if (typeof SkyArchiveGalleryService !== 'undefined') {
        // Featured Panorama Slider (on index.html)
        if (document.querySelector('#panoramas .splide')) {
            console.log("Initializing panorama slider via GalleryService...");
            const sliderList = SkyArchiveGalleryService.initPanoramaSlider(featuredPanoData);
            if (sliderList) {
                SkyArchiveGalleryService.initSliderPannellumPlaceholders(sliderList);
                SkyArchiveGalleryService.addSliderClickListeners(sliderList);
            }
        }
        // Featured Astro Gallery Slider (on index.html)
        if (document.getElementById('astro-photo-splide') && astroData) {
            console.log("Initializing featured astrophoto gallery via GalleryService...");
            SkyArchiveGalleryService.initFeaturedAstroGallery(astroData, MAX_FEATURED_ASTROPHOTOS);
        }
        // Panorama Gallery Page (panorama-gallery.html)
        if (document.querySelector('main.gallery-container .gallery-grid') && window.location.pathname.includes('panorama-gallery.html')) {
            console.log("Initializing panorama gallery page via GalleryService...");
            SkyArchiveGalleryService.initGallery(panoData);
        }
        // Astro Gallery Page (astro-gallery.html)
        if (document.querySelector('main.gallery-container .astro-gallery-grid') && window.location.pathname.includes('astro-gallery.html')) {
            console.log("Initializing astro gallery page via GalleryService...");
            SkyArchiveGalleryService.initAstroGallery(astroData);
        }
    } else {
        console.error("SkyArchiveGalleryService is not available. Galleries and sliders may not be initialized.");
    }
}

function initFeaturedVisualizations(featuredData) {
    const selectElement = document.getElementById('featuredLocationSelect');
    const histogramCanvasId = 'featuredSqmHistogram';
    const polarPlotContainerId = 'featuredPolarPlotContainer';

    if (!selectElement || !document.getElementById(histogramCanvasId) || !document.getElementById(polarPlotContainerId)) {
        console.warn("Featured visualizations elements not found. Skipping initialization.");
        return;
    }
    selectElement.innerHTML = ''; // Clear existing options

    if (!featuredData || featuredData.length === 0) {
        selectElement.innerHTML = '<option value="">No featured locations found</option>';
        if (typeof SkyArchiveVisualizationService !== 'undefined') {
            SkyArchiveVisualizationService.createHistogram(histogramCanvasId, []);
            SkyArchiveVisualizationService.createPolarPlot(polarPlotContainerId, [], {});
        }
        return;
    }

    featuredData.forEach((item, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${item.locationName} (${item.date})`;
        selectElement.appendChild(option);
    });

    const updateVisualizations = () => {
        const selectedIndex = parseInt(selectElement.value, 10);
        if (!isNaN(selectedIndex) && featuredData[selectedIndex]) {
            const selectedData = featuredData[selectedIndex];
            console.log(`Updating visualizations for: ${selectedData.locationName} using VisualizationService.`);

            if (typeof SkyArchiveVisualizationService !== 'undefined') {
                SkyArchiveVisualizationService.createHistogram(histogramCanvasId, selectedData.allSqmValues);
                const locationDetails = { name: selectedData.locationName, date: selectedData.date, lat: selectedData.latitude, lon: selectedData.longitude };
                try {
                    SkyArchiveVisualizationService.createPolarPlot(polarPlotContainerId, selectedData.polarData, locationDetails);
                } catch (error) {
                     console.error("Error creating polar plot via VisualizationService:", error);
                }
            } else {
                console.error("SkyArchiveVisualizationService is not available for updating visualizations.");
            }
        } else {
            console.warn("Invalid selection or data not found for index:", selectElement.value);
            if (typeof SkyArchiveVisualizationService !== 'undefined') {
                SkyArchiveVisualizationService.createHistogram(histogramCanvasId, []);
                SkyArchiveVisualizationService.createPolarPlot(polarPlotContainerId, [], {});
            }
        }
    };
    selectElement.addEventListener('change', updateVisualizations);
    if (featuredData.length > 0) {
        selectElement.value = '0';
        updateVisualizations();
    }
}

function clearStaticContent() {
    const sliderList = document.querySelector('#panoramas .splide__list');
    if (sliderList) sliderList.innerHTML = '';
    
    const astroSliderList = document.querySelector('#astro-photo-splide .splide__list');
    if (astroSliderList) astroSliderList.innerHTML = '';

    const panoGalleryGrid = document.querySelector('main.gallery-container .gallery-grid');
    if (panoGalleryGrid && window.location.pathname.includes('panorama-gallery.html')) panoGalleryGrid.innerHTML = '';

    const astroGalleryGrid = document.querySelector('main.gallery-container .astro-gallery-grid');
    if (astroGalleryGrid && window.location.pathname.includes('astro-gallery.html')) astroGalleryGrid.innerHTML = '';

    const featuredSelect = document.getElementById('featuredLocationSelect');
    if (featuredSelect) featuredSelect.innerHTML = '';
}

// --- Global Error Display Function ---
function displayGlobalErrorMessage(message) {
    let errorContainer = document.getElementById('global-error-message-container');
    if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.id = 'global-error-message-container';
        errorContainer.style.position = 'fixed';
        errorContainer.style.top = '0';
        errorContainer.style.left = '0';
        errorContainer.style.width = '100%';
        errorContainer.style.backgroundColor = 'rgba(255, 0, 0, 0.85)'; // Red, slightly transparent
        errorContainer.style.color = 'white';
        errorContainer.style.padding = '10px 20px';
        errorContainer.style.textAlign = 'center';
        errorContainer.style.zIndex = '10001'; // Very high z-index
        errorContainer.style.fontSize = '1rem';
        errorContainer.style.borderBottom = '2px solid rgba(150, 0, 0, 0.7)';
        const header = document.querySelector('header');
        if (header) {
            header.parentNode.insertBefore(errorContainer, header.nextSibling);
        } else {
            document.body.insertBefore(errorContainer, document.body.firstChild);
        }
    }
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    console.error("Global Error Displayed:", message);
}

// --- DOMContentLoaded Event Listener ---
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM Loaded. Main script.js execution starting.");

    // Initialize language switcher dropdown
    const languageDropdown = document.getElementById('languageDropdown');
    if (languageDropdown) {
        languageDropdown.addEventListener('click', (event) => {
            if (event.target.tagName === 'A' && event.target.dataset.lang) {
                event.preventDefault();
                setLanguage(event.target.dataset.lang);
            }
        });
    }

    // Load initial translations and set initial language display
    loadTranslations(currentLanguage);
    updateLanguageSwitcherDisplay(); // Ensure display is correct on load

    // Initialize sky comparison card links for index.html
    if(window.location.pathname.endsWith('index.html') || window.location.pathname === '/skyarchive/' || window.location.pathname === '/skyarchive/index.html') {
        initSkyComparisonCardLinks();
    }

    // Load data using DataService, which then calls initializeUI.
    if (typeof SkyArchiveDataService !== 'undefined' && typeof SkyArchiveDataService.loadAndProcessData === 'function') {
        SkyArchiveDataService.loadAndProcessData('data/manifest.json', 'data/astro_manifest.json', MAX_FEATURED_PANORAMAS);
    } else {
        console.error("SkyArchiveDataService is not available. Data will not be loaded.");
        const bodyElement = document.querySelector('body');
        if (bodyElement && (window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('panorama-gallery.html') || window.location.pathname.endsWith('astro-gallery.html'))) {
            let errorContainer = document.getElementById('main-error-container');
            if (!errorContainer) {
                errorContainer = document.createElement('div');
                errorContainer.id = 'main-error-container';
                errorContainer.style.color = "red";
                errorContainer.style.textAlign = "center";
                errorContainer.style.padding = "20px";
                errorContainer.style.backgroundColor = "black";
                const mainHeader = document.querySelector('header');
                if (mainHeader) {
                    mainHeader.parentNode.insertBefore(errorContainer, mainHeader.nextSibling);
                }
            }
            errorContainer.textContent = "Critical error: Essential data services failed to load. Site content may be incomplete or missing.";
        }
    }
});
