// js/services/dataService.js
// Handles data fetching and processing for SkyArchive.

const SkyArchiveDataService = (() => {

    const sqmCache = {}; // Caches SQM data to avoid redundant fetches.

    // Calculates the median from an array of numbers.
    function calculateMedian(numbers) {
        if (!numbers || numbers.length === 0) {
            return null;
        }
        const sorted = [...numbers].sort((a, b) => a - b);
        const middleIndex = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
        } else {
            return sorted[middleIndex];
        }
    }

    // Fetches and parses SQM data from a given URL.
    // Returns an object with medianSqm, allSqmValues, and polarData.
    async function fetchAndParseSqm(sqmFileUrl) {
        if (sqmCache[sqmFileUrl]) {
            return sqmCache[sqmFileUrl];
        }
        try {
            const response = await fetch(sqmFileUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} for ${sqmFileUrl}`);
            }
            const textData = await response.text();
            const lines = textData.split('\n');
            const sqmValuesForMedian = [];
            const allSqmValues = [];
            const polarData = [];
            let dataStarted = false;

            for (const line of lines) {
                if (!dataStarted) {
                    if (!line.trim().startsWith('#') && line.trim().length > 0) {
                        dataStarted = true;
                    } else {
                        continue;
                    }
                }
                if (line.trim().length === 0) continue;

                const columns = line.trim().split(/\s+/);
                if (columns.length >= 9) {
                    const time = columns[2];
                    const mag = parseFloat(columns[5]);
                    const alt = parseFloat(columns[7]);
                    const azi = parseFloat(columns[8]);

                    if (!isNaN(mag)) {
                        allSqmValues.push(mag);
                        if (time && !isNaN(alt) && alt >= 0 && alt <= 90 && !isNaN(azi) && azi >= 0 && azi <= 360) {
                             polarData.push({ time, mag, alt, azi });
                        }
                        if (!isNaN(alt) && alt > 45) {
                            sqmValuesForMedian.push(mag);
                        }
                    }
                }
            }

            let medianSqm = null;
            if (sqmValuesForMedian.length > 0) {
                medianSqm = calculateMedian(sqmValuesForMedian);
            }
            const processedData = {
                medianSqm: medianSqm,
                allSqmValues: allSqmValues,
                polarData: polarData
            };
            sqmCache[sqmFileUrl] = processedData;
            return processedData;

        } catch (error) {
            console.error(`Error fetching or parsing SQM file ${sqmFileUrl}:`, error);
            return { medianSqm: null, allSqmValues: [], polarData: [] }; // Return empty data on error.
        }
    }

    // Loads panorama and astrophotography manifests, processes the data,
    // and then calls the global initializeUI function.
    async function loadAndProcessData(panoManifestPath = 'data/manifest.json', astroManifestPath = 'data/astro_manifest.json', MAX_FEATURED_PANORAMAS_CONFIG) {
        console.log("DataService: Loading manifests...");
        try {
            const [panoManifestResponse, astroManifestResponse] = await Promise.all([
                fetch(panoManifestPath),
                fetch(astroManifestPath)
            ]);

            if (!panoManifestResponse.ok) {
                throw new Error(`HTTP error! status: ${panoManifestResponse.status} for panorama manifest`);
            }
            const panoManifest = await panoManifestResponse.json();

            let astroManifest = [];
            if (astroManifestResponse.ok) {
                astroManifest = await astroManifestResponse.json();
            } else {
                console.warn(`DataService: Could not load ${astroManifestPath}: ${astroManifestResponse.status}. Astro gallery will be empty.`);
            }

            const featuredItemsCount = Math.min(panoManifest.length, MAX_FEATURED_PANORAMAS_CONFIG);

            const processPanoItem = async (item, isFeaturedFlag) => {
                const sqmResult = await fetchAndParseSqm(item.sqmFileUrl);
                let locationName = [item.locality, item.region, item.country].filter(Boolean).join(', ');
                if (!locationName && item.latitude && item.longitude) {
                    locationName = `Lat: ${item.latitude.toFixed(3)}, Lon: ${item.longitude.toFixed(3)}`;
                } else if (!locationName) {
                    locationName = "Unknown Location";
                }
                return {
                    ...item,
                    medianSqm: sqmResult.medianSqm !== null ? sqmResult.medianSqm.toFixed(2) : "N/A",
                    allSqmValues: sqmResult.allSqmValues,
                    polarData: sqmResult.polarData,
                    locationName: locationName,
                    isFeatured: isFeaturedFlag
                };
            };

            const featuredPanoProcessingPromises = panoManifest.slice(0, featuredItemsCount).map(item => processPanoItem(item, true));
            const remainingPanoProcessingPromises = panoManifest.slice(featuredItemsCount).map(item => processPanoItem(item, false));

            const featuredPanoData = await Promise.all(featuredPanoProcessingPromises);
            const remainingPanoData = await Promise.all(remainingPanoProcessingPromises);
            const processedPanoData = [...featuredPanoData, ...remainingPanoData];

            const processedAstroData = astroManifest;

            if (typeof initializeUI === 'function') {
                initializeUI({
                    panoData: processedPanoData,
                    astroData: processedAstroData
                });
            } else {
                console.error("DataService: initializeUI function is not defined globally.");
                if (typeof displayGlobalErrorMessage === 'function') {
                    displayGlobalErrorMessage("Critical error: UI initialization function not found. Site may not load correctly.");
                }
            }

        } catch (error) {
            console.error("DataService: Failed to load or process critical site data:", error);
            if (typeof displayGlobalErrorMessage === 'function') {
                 displayGlobalErrorMessage(`Error loading essential site data: ${error.message}. Some content may be unavailable or incorrect.`);
            } else {
                alert(`Error loading essential site data: ${error.message}. Some content may be unavailable or incorrect.`);
            }
        }
    }

    // Expose public functions
    return {
        fetchAndParseSqm: fetchAndParseSqm,
        loadAndProcessData: loadAndProcessData,
        calculateMedian: calculateMedian
    };

})();
