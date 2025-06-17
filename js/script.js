// --- Configuration ---
const MAX_FEATURED_PANORAMAS = 6; // Max number of panoramas to show in the featured slider/histogram

// --- Functions ---
function viewPanorama(title, date, sqm, panoramaUrl, sqmFileUrl, latitude, longitude) { // Added lat, lon
    // Construct URL with parameters instead of using sessionStorage
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

async function fetchAndParseSqm(sqmFileUrl) {
    try {
        const response = await fetch(sqmFileUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${sqmFileUrl}`);
        }
        const textData = await response.text();
        const lines = textData.split('\n');
        const sqmValuesForMedian = []; // Values with Alt > 45 for median calculation
        const allSqmValues = []; // All valid magnitude values for histogram
        const polarData = []; // Data for polar plot {time, mag, alt, azi}
        let dataStarted = false;

        for (const line of lines) {
            if (!dataStarted) {
                // Skip comments and empty lines until the first data line
                if (!line.trim().startsWith('#') && line.trim().length > 0) {
                    dataStarted = true;
                } else {
                    continue;
                }
            }
            if (line.trim().length === 0) continue; // Skip empty lines after data starts

            const columns = line.trim().split(/\s+/);
            // Expecting at least date, time, ..., mag, ..., alt, azi (cols 5, 7, 8)
            // Assuming fixed columns: 2=time, 5=mag, 7=alt, 8=azi
            if (columns.length >= 9) {
                const time = columns[2];
                const mag = parseFloat(columns[5]);
                const alt = parseFloat(columns[7]);
                const azi = parseFloat(columns[8]);

                if (!isNaN(mag)) {
                    allSqmValues.push(mag); // Add to list for histogram
                    // Add to polar data if alt and azi are valid
                    if (time && !isNaN(alt) && alt >= 0 && alt <= 90 && !isNaN(azi) && azi >= 0 && azi <= 360) {
                         polarData.push({ time, mag, alt, azi });
                    }
                    // Add to median calculation list if alt > 45
                    if (!isNaN(alt) && alt > 45) {
                        sqmValuesForMedian.push(mag);
                    }
                }
            } else {
                console.warn(`Skipping malformed line in ${sqmFileUrl}: ${line}`);
            }
        }

        let medianSqm = null;
        if (sqmValuesForMedian.length > 0) {
            medianSqm = calculateMedian(sqmValuesForMedian);
            console.log(`Calculated Median SQM (Alt > 45°) for ${sqmFileUrl}: ${medianSqm?.toFixed(2)} from ${sqmValuesForMedian.length} points.`);
        } else {
            console.warn(`No SQM values found with Alt > 45 in ${sqmFileUrl} for median calculation.`);
        }

        if (allSqmValues.length === 0) {
             console.warn(`No valid SQM magnitude values found in ${sqmFileUrl} for histogram.`);
        }
        if (polarData.length === 0) {
             console.warn(`No valid data points found for polar plot in ${sqmFileUrl}`);
        }

        // Return all processed data
        return {
            medianSqm: medianSqm,
            allSqmValues: allSqmValues,
            polarData: polarData
        };

    } catch (error) {
        console.error(`Error fetching or parsing SQM file ${sqmFileUrl}:`, error);
        // Return nulls or an empty structure in case of error
        return { medianSqm: null, allSqmValues: [], polarData: [] };
    }
}
// Function to handle clicks on sky comparison cards
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
        const sqmData = await fetchAndParseSqm(sqmFileUrl);
        const medianSqmValue = sqmData && sqmData.medianSqm !== null ? sqmData.medianSqm.toFixed(2) : '';
        viewPanorama(title, date, medianSqmValue, panoramaUrl, sqmFileUrl, latitude, longitude);
    } catch (error) {
        console.error("Error fetching or processing SQM data for sky comparison card:", error);
        // Fallback to opening without SQM value if processing fails
        viewPanorama(title, date, '', panoramaUrl, sqmFileUrl, latitude, longitude);
    }
}

// Initialize links for sky comparison cards
function initSkyComparisonCardLinks() {
    const skyCards = document.querySelectorAll('.sky-comparison-grid .sky-image-card');
    skyCards.forEach(card => {
        card.style.cursor = 'pointer'; 
        card.addEventListener('click', handleSkyComparisonCardClick);
    });
}

// --- START: Histogram Functions (copied from data-viewer.html and adapted) ---

// Function to create the histogram with fixed bins
function createHistogram(canvasId, sqmValues) {
    if (!sqmValues || sqmValues.length === 0) {
        console.warn("No SQM values provided for histogram on canvas:", canvasId);
        // Optionally clear the canvas or show a message
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            // Clear previous chart instance if it exists
            const existingChart = Chart.getChart(canvasId);
            if (existingChart) {
                existingChart.destroy();
            }
            // Display a message on the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#a0a0a0';
            ctx.fillText('No SQM data available for this selection.', canvas.width / 2, canvas.height / 2);
        }
        return null; // Indicate no chart was created
    }

    const canvas = document.getElementById(canvasId);
     if (!canvas) {
         console.error(`Canvas element with ID ${canvasId} not found.`);
         return null;
     }
    const ctx = canvas.getContext('2d');

    // Clear previous chart instance if it exists
    const existingChart = Chart.getChart(canvasId);
    if (existingChart) {
        existingChart.destroy();
    }

    // --- Fixed Binning Strategy ---
    const binWidth = 0.2;
    const minRange = 16.0;
    const maxRange = 22.0;
    const numCoreBins = Math.round((maxRange - minRange) / binWidth); // Should be 30

    // Define labels
    const labels = ['<16'];
    for (let i = 0; i < numCoreBins; i++) {
        const start = minRange + i * binWidth;
        const end = start + binWidth;
        labels.push(`${start.toFixed(1)}-${end.toFixed(1)}`);
    }
    labels.push('>22'); // Technically >= 22.0

    // Initialize bins
    const bins = Array(labels.length).fill(0);
    const underflowBinIndex = 0;
    const overflowBinIndex = labels.length - 1;

    // Populate bins
    sqmValues.forEach(val => {
        if (isNaN(val)) return; // Skip non-numeric values

        if (val < minRange) {
            bins[underflowBinIndex]++;
        } else if (val >= maxRange) {
            bins[overflowBinIndex]++;
        } else {
            // Calculate index for bins between minRange and maxRange
            // Offset by 1 because index 0 is the underflow bin
            const binIndex = Math.floor((val - minRange) / binWidth) + 1;
            // Ensure index is within the valid range of core bins
            if (binIndex > 0 && binIndex < overflowBinIndex) {
                bins[binIndex]++;
            } else {
                 // This case handles val exactly equal to minRange if floor logic needs adjustment,
                 // or potentially edge cases near maxRange depending on float precision.
                 // Let's ensure values exactly at minRange go into the first core bin.
                 if (val === minRange) {
                     bins[1]++; // First core bin
                 } else {
                    console.warn(`Value ${val} could not be placed precisely, check logic near boundaries.`);
                    // As a fallback, place near-max values into the last core bin if they didn't hit overflow
                    if (val < maxRange) {
                        bins[overflowBinIndex - 1]++;
                    } else {
                         bins[overflowBinIndex]++; // Should have been caught by >= maxRange
                    }
                 }
            }
        }
    });


    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'SQM Measurement Count',
                data: bins,
                backgroundColor: 'rgba(128, 128, 128, 0.7)', // 50% grey with 0.7 alpha
                borderColor: 'rgba(128, 128, 128, 1)', // 50% grey solid
                borderWidth: 1,
                barPercentage: 1.0,
                categoryPercentage: 0.95
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            // Adjust title for edge bins
                            const label = tooltipItems[0].label;
                            if (label === '<16' || label === '>22') {
                                return `SQM Range: ${label} mag/arcsec²`;
                            }
                            return `SQM Range: ${label} mag/arcsec²`;
                        },
                        label: function(context) {
                            return `Count: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'SQM Value (mag/arcsec²)', color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0', autoSkip: true, maxTicksLimit: 15 }
                },
                y: {
                    title: { display: true, text: 'Measurement Count', color: '#a0a0a0' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#a0a0a0', precision: 0 },
                    beginAtZero: true
                }
            }
        }
    });
    console.log(`Histogram created/updated for canvas: ${canvasId}`);
    return chart;
}

// --- END: Histogram Functions ---


// --- START: Polar Plot Function (copied from data-viewer.html) ---

// Function to create the D3 Polar Plot
function createPolarPlot(containerId, polarData, locationDetails) { // Added locationDetails
    if (!polarData || polarData.length === 0) {
        console.error("No polar data provided for plot.");
        // Optionally clear or show message in container
        const container = d3.select(`#${containerId}`);
        container.select("svg").remove(); // Clear previous plot
        container.select(".d3-tooltip").remove(); // Clear previous tooltip
        // Show a 'no data' message if needed
        // container.append("div").attr("class", "error-message").style("display", "block").text("No polar data available.");
        return null;
    }

    const container = d3.select(`#${containerId}`);
    container.select("svg").remove(); // Clear previous plot if any
    container.select(".d3-tooltip").remove(); // Clear previous tooltip if any


    const containerNode = container.node();
    const margin = { top: 40, right: 40, bottom: 40, left: 40 };

    // Calculate available space using clientWidth/clientHeight (excludes padding/border)
    const availableWidth = containerNode.clientWidth - margin.left - margin.right;
    const availableHeight = containerNode.clientHeight - margin.top - margin.bottom;

    // Define label parameters
    const labelOffset = 15;
    const labelFontSizeEstimate = 12;
    const labelSpace = (2 * labelOffset) + labelFontSizeEstimate; // Total space needed for labels vertically/horizontally

    // --- Try diameter based on width first ---
    let diameter = Math.max(availableWidth, 100); // Initial diameter based on width

    // Calculate the total height this width-based diameter would require (plot content + margins)
    let requiredTotalHeight = diameter + labelSpace + margin.top + margin.bottom;

    // --- Check if it fits vertically ---
    // Compare requiredTotalHeight with the container's actual clientHeight (which includes padding)
    if (requiredTotalHeight > containerNode.clientHeight && availableHeight > 100) { // Check availableHeight too
        // It's too tall, recalculate diameter based on available height
        // availableHeight = diameter + labelSpace
        diameter = Math.max(availableHeight - labelSpace, 100); // Ensure min size
        // console.log("Plot height constrained, recalculating diameter based on height:", diameter);
    } else {
        // console.log("Plot width constrained, using width-based diameter:", diameter);
        // Ensure diameter isn't larger than available height allows, even if width is primary constraint
         diameter = Math.max(Math.min(diameter, availableHeight - labelSpace), 100);
    }


    // --- Final calculations based on chosen diameter ---
    const radius = diameter / 2;

    // Calculate required width/height for the plot content itself using the final diameter
    const requiredPlotWidth = diameter + labelSpace;
    const requiredPlotHeight = diameter + labelSpace;

    // Calculate viewBox dimensions including margins
    const viewBoxWidth = requiredPlotWidth + margin.left + margin.right;
    const viewBoxHeight = requiredPlotHeight + margin.top + margin.bottom;

    // Calculate translation for the main group to center the plot
    const translateX = viewBoxWidth / 2;
    const translateY = viewBoxHeight / 2;

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`) // Use calculated viewBox
        .attr("preserveAspectRatio", "xMidYMid meet") // Let SVG scaling handle fitting
        .attr("width", "100%") // Set width relative to container
        .style("display", "block") // Ensure block display behavior
        .append("g")
        .attr("transform", `translate(${translateX}, ${translateY})`); // Center group in calculated viewBox

    // --- Scales ---
    // Altitude (radius): 90 degrees (zenith) at center, 0 degrees (horizon) at edge
    const rScale = d3.scaleLinear()
        .domain([0, 90]) // Altitude degrees
        .range([radius, 0]); // Map to plot radius (inverted)

    // Azimuth (angle): 0-360 degrees. We need to map this to radians for D3.
    // D3 angle: 0 is right, PI/2 is down, PI is left, 3*PI/2 is up.
    // Target: 0 (N) up, 90 (E) right, 180 (S) down, 270 (W) left.
    // Conversion: angle_rad = (azimuth_deg - 90) * Math.PI / 180
    // No need for a thetaScale, we calculate angle directly.

    // Color: Viridis scale based on SQM magnitude range
    const magExtent = d3.extent(polarData, d => d.mag);
    // Add a small buffer to extent if min === max
    if (magExtent[0] === magExtent[1]) {
        magExtent[0] -= 0.1;
        magExtent[1] += 0.1;
    }
    const colorScale = d3.scaleSequential(d3.interpolateViridis)
        .domain([magExtent[1], magExtent[0]]); // Inverted domain: higher SQM = brighter color

    // --- Axes and Gridlines ---
    // Radial gridlines (Altitude circles)
    const radialTicks = [0, 30, 60, 90]; // Altitudes to draw circles for
    svg.selectAll(".radial-grid")
        .data(radialTicks)
        .enter().append("circle")
        .attr("class", "radial-grid")
        .attr("r", d => rScale(d))
        .style("fill", "none")
        .style("stroke", "rgba(255, 255, 255, 0.2)")
        .style("stroke-dasharray", "4 4");

    // Altitude labels (shifted to NE line)
    const altitudeLabelAngleRad = (45 - 90) * Math.PI / 180; // Angle for NE
    svg.selectAll(".radial-label")
        .data(radialTicks.filter(d => d > 0 && d < 90)) // Label 30, 60
        .enter().append("text")
        .attr("class", "radial-label")
        .attr("y", d => rScale(d) * Math.sin(altitudeLabelAngleRad) - 5) // Position along NE line, offset slightly
        .attr("x", d => rScale(d) * Math.cos(altitudeLabelAngleRad) + 5)
        .style("text-anchor", "start") // Anchor to start for NE line
        .style("fill", "rgba(255, 255, 255, 0.7)")
        .style("font-size", "10px")
        .text(d => `${d}°`);
    // Removed Zenith label


    // Angular gridlines (Azimuth lines)
    const angularTicks = [0, 45, 90, 135, 180, 225, 270, 315]; // Azimuths
    svg.selectAll(".angular-grid")
        .data(angularTicks)
        .enter().append("line")
        .attr("class", "angular-grid")
        .attr("y1", 0)
        .attr("x1", 0)
        .attr("y2", d => -radius * Math.sin((d - 90) * Math.PI / 180)) // Calculate endpoint based on angle
        .attr("x2", d => radius * Math.cos((d - 90) * Math.PI / 180))
        .style("stroke", "rgba(255, 255, 255, 0.2)")
        .style("stroke-dasharray", "4 4");

    // Azimuth labels (N, E, S, W - Cardinal)
    const cardinalPoints = [{label: "N", angle: 0}, {label: "E", angle: 90}, {label: "S", angle: 180}, {label: "W", angle: 270}];
    const cardinalLabelRadius = radius + 25; // Offset for cardinal labels
    svg.selectAll(".cardinal-label")
        .data(cardinalPoints)
        .enter().append("text")
        .attr("class", "cardinal-label")
        .attr("dy", "0.35em") // Vertical alignment
        .attr("transform", d => {
            const angleRad = (d.angle - 90) * Math.PI / 180;
            const x = cardinalLabelRadius * Math.cos(angleRad);
            const y = cardinalLabelRadius * Math.sin(angleRad);
             return `translate(${x}, ${y})`;
        })
        .style("text-anchor", "middle")
        .style("fill", "rgba(255, 255, 255, 0.9)")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text(d => d.label);

    // Azimuth labels (NE, SE, SW, NW - Intercardinal)
    const intercardinalPoints = [{label: "NE", angle: 45}, {label: "SE", angle: 135}, {label: "SW", angle: 225}, {label: "NW", angle: 315}];
    const intercardinalLabelRadius = radius + 20; // Slightly closer offset for intercardinal
    svg.selectAll(".intercardinal-label")
        .data(intercardinalPoints)
        .enter().append("text")
        .attr("class", "intercardinal-label")
        .attr("dy", "0.35em")
        .attr("transform", d => {
            const angleRad = (d.angle - 90) * Math.PI / 180;
            const x = intercardinalLabelRadius * Math.cos(angleRad);
            const y = intercardinalLabelRadius * Math.sin(angleRad);
             return `translate(${x}, ${y})`;
        })
        .style("text-anchor", "middle")
        .style("fill", "rgba(255, 255, 255, 0.7)") // Slightly dimmer
        .style("font-size", "10px") // Smaller font size
        .text(d => d.label);

    // Vertical Axis Label
    svg.append("text")
        .attr("class", "axis-label-vertical")
        .attr("transform", "rotate(-90)") // Rotate the text
        .attr("y", 0 - radius - margin.left + -15) // Position to the left of the plot
        .attr("x", 0) // Center vertically relative to plot center before rotation
        .attr("dy", "1em") // Adjust vertical position slightly
        .style("text-anchor", "middle")
        .style("fill", "rgba(255, 255, 255, 0.7)")
        .style("font-size", "10px") // Increased base font size
        .text("Measurements in mag/arcsec²");


    // --- Data Points ---
    const baseRadius = 10; // Scaled down base radius (~1.2x smaller)
    const hoverRadius = 15; // Scaled down hover radius (~1.2x smaller)

    const pointsGroup = svg.append("g"); // Group for points
    const points = pointsGroup.selectAll(".data-point")
        .data(polarData)
        .enter().append("g")
        .attr("class", "data-point")
        .attr("transform", d => {
            const r = rScale(d.alt);
            const angleRad = (d.azi - 90) * Math.PI / 180; // Adjust angle: 0=N up
            const x = r * Math.cos(angleRad);
            const y = r * Math.sin(angleRad);
            return `translate(${x}, ${y})`;
        });

    // Draw circles for each point
    points.append("circle")
        .attr("r", baseRadius) // Use base radius
        .style("fill", d => colorScale(d.mag))
        .style("stroke", "none") // Remove stroke
        .style("stroke-width", 1)
        .style("cursor", "pointer") // Indicate interactivity
        .transition() // Add initial transition (optional)
        .duration(500)
        .attr("r", baseRadius); // Ensure correct initial size

    // Add SQM value text inside or near the circle (optional, can get crowded)
    points.append("text")
        .attr("dy", "0.35em") // Center text vertically
        .style("text-anchor", "middle")
        .style("font-size", "7px") // Further scaled down base font size
        .style("fill", d => d3.lab(colorScale(d.mag)).l > 60 ? "#000" : "#fff")
        .style("pointer-events", "none") // Text shouldn't block hover on circle
        .text(d => d.mag); // Display full precision

    // Add Tooltip (using container selection to ensure it's removed with the SVG)
    // --- Tooltip ---
    const tooltip = d3.select("body").append("div") // Append tooltip to body to avoid SVG clipping issues
        .attr("class", "d3-tooltip");

    // --- Hover Interaction ---
    points
        .on("mouseover", function(event, d) { // Use function to access 'this'
            const group = d3.select(this);
            group.select("circle")
                .transition()
                .duration(150)
                .attr("r", hoverRadius) // Enlarge circle
                .style("stroke", "#FFF") // Add temporary stroke on hover for visibility
                .style("stroke-width", 1);
            group.select("text") // Select text element
                .transition()
                .duration(150)
                .style("font-size", "9px"); // Further scaled down hover font size

            // Bring hovered element to front (optional, can impact performance with many points)
            // d3.select(this).raise();

            // Format tooltip content
            let tooltipHtml = `<strong>Location:</strong> ${locationDetails.name}<br>`;
            tooltipHtml += `<strong>Date:</strong> ${locationDetails.date} ${d.time || ''}<br>`; // Add time if available
            if (locationDetails.lat && locationDetails.lon) {
                tooltipHtml += `<strong>Coords:</strong> ${parseFloat(locationDetails.lat).toFixed(4)}, ${parseFloat(locationDetails.lon).toFixed(4)}<br>`;
            }
            tooltipHtml += `<strong>SQM:</strong> ${d.mag.toFixed(2)} mag/arcsec²<br>`;
            tooltipHtml += `<strong>Altitude:</strong> ${d.alt.toFixed(1)}°<br>`;
            tooltipHtml += `<strong>Azimuth:</strong> ${d.azi.toFixed(1)}°`;

            tooltip.html(tooltipHtml)
                   .style("visibility", "visible");
        })
        .on("mousemove", (event) => {
            tooltip.style("top", (event.pageY + 15) + "px") // Position below cursor
                   .style("left", (event.pageX + 15) + "px");
        })
        .on("mouseout", function(event, d) { // Use function to access 'this'
            const group = d3.select(this);
            group.select("circle")
                .transition()
                .duration(150)
                .attr("r", baseRadius) // Return to base radius
                .style("stroke", "none"); // Remove stroke again
                // Removed stroke-width setting as stroke is none
            group.select("text") // Select text element
                .transition()
                .duration(150)
                .style("font-size", "7px"); // Return font size to further scaled down base

            tooltip.style("visibility", "hidden");
        });


    return svg; // Return the created SVG element
}

// --- END: Polar Plot Function ---


// --- START: Location Name Fetching (REMOVED) ---

// The fetchLocationName function has been removed as location data is now sourced directly from the manifest.

async function loadAndProcessData() {
    console.log("Loading manifests...");
    try {
        const [panoManifestResponse, astroManifestResponse] = await Promise.all([
            fetch('data/manifest.json'),
            fetch('data/astro_manifest.json')
        ]);

        if (!panoManifestResponse.ok) {
            throw new Error(`HTTP error! status: ${panoManifestResponse.status} for panorama manifest`);
        }
        const panoManifest = await panoManifestResponse.json();
        console.log("Panorama Manifest loaded:", panoManifest);

        let astroManifest = [];
        if (astroManifestResponse.ok) {
            astroManifest = await astroManifestResponse.json();
            console.log("Astro Manifest loaded:", astroManifest);
        } else {
            console.warn(`Could not load astro_manifest.json: ${astroManifestResponse.status}. Astro gallery will be empty.`);
        }

        // --- Process Panorama Data ---
        const featuredItemsCount = Math.min(panoManifest.length, MAX_FEATURED_PANORAMAS);
        const featuredPanoManifest = panoManifest.slice(0, featuredItemsCount);
        const fullPanoManifest = panoManifest;

        const featuredPanoProcessingPromises = featuredPanoManifest.map(async (item) => {
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
                isFeatured: true
            };
        });
        const featuredPanoData = await Promise.all(featuredPanoProcessingPromises);

        const remainingPanoManifest = fullPanoManifest.slice(featuredItemsCount);
        const remainingPanoProcessingPromises = remainingPanoManifest.map(async (item) => {
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
                 isFeatured: false
             };
         });
        const remainingPanoData = await Promise.all(remainingPanoProcessingPromises);
        const processedPanoData = [...featuredPanoData, ...remainingPanoData];
        console.log("Panorama data processed:", processedPanoData);

        // Astro data is already in a suitable format, just pass it along.
        const processedAstroData = astroManifest;
        console.log("Astro data processed:", processedAstroData);

        initializeUI({
            panoData: processedPanoData,
            astroData: processedAstroData
        });

    } catch (error) {
        console.error("Failed to load or process data:", error);
        alert("Error loading site data. Please check the console for details.");
    }
}

function initializeUI(allData) {
    console.log("Initializing UI with all data:", allData);
    const { panoData, astroData } = allData;
    clearStaticContent();

    const featuredPanoData = panoData.filter(item => item.isFeatured);

    if (document.getElementById('lightPollutionMap')) {
        console.log("Initializing map...");
        initMap(panoData); // Map uses all panorama data
    }
    if (document.getElementById('featuredSqmHistogram') && document.getElementById('featuredPolarPlotContainer')) {
        console.log("Initializing featured visualizations...");
        initFeaturedVisualizations(featuredPanoData); // Uses featured panorama data
    }
    if (document.querySelector('.splide')) {
        console.log("Initializing panorama slider...");
        const sliderList = initPanoramaSlider(featuredPanoData); // Uses featured panorama data
        if (sliderList) {
            initSliderPannellumPlaceholders(sliderList);
            addSliderClickListeners(sliderList);
        }
    }
    if (document.getElementById('contactForm')) {
        initContactForm();
    }
    if (document.querySelector('.gallery-grid')) { // This is for the Panorama Gallery
        console.log("Initializing panorama gallery...");
        initGallery(panoData); // Panorama gallery uses all panorama data
    }
    if (document.querySelector('.astro-gallery-grid')) { // This is for the new Astro Gallery
        console.log("Initializing astro gallery...");
        initAstroGallery(astroData); // Astro gallery uses astro data
    }
}

// --- NEW Function to initialize the featured histogram ---
function initFeaturedVisualizations(featuredData) { // Renamed function
    const selectElement = document.getElementById('featuredLocationSelect');
    const histogramCanvasId = 'featuredSqmHistogram';
    const polarPlotContainerId = 'featuredPolarPlotContainer'; // Get ID for polar plot

    if (!selectElement || !document.getElementById(histogramCanvasId) || !document.getElementById(polarPlotContainerId)) { // Check both containers
        console.warn("Featured visualizations select element, histogram canvas, or polar plot container not found. Skipping initialization.");
        return;
    }

    // Clear existing options
    selectElement.innerHTML = '';

    if (!featuredData || featuredData.length === 0) {
        selectElement.innerHTML = '<option value="">No featured locations found</option>';
        createHistogram(histogramCanvasId, []); // Clear histogram
        createPolarPlot(polarPlotContainerId, [], {}); // Clear polar plot
        return;
    }

    // Populate dropdown
    featuredData.forEach((item, index) => {
        const option = document.createElement('option');
        option.value = index; // Use index to easily retrieve data
        option.textContent = `${item.locationName} (${item.date})`;
        selectElement.appendChild(option);
    });

    // Function to update both visualizations based on selection
    const updateVisualizations = () => { // Renamed function
        const selectedIndex = parseInt(selectElement.value, 10);
        if (!isNaN(selectedIndex) && featuredData[selectedIndex]) {
            const selectedData = featuredData[selectedIndex];
            console.log(`Updating visualizations for: ${selectedData.locationName}`);

            // Update Histogram
            createHistogram(histogramCanvasId, selectedData.allSqmValues);

            // Update Polar Plot
            const locationDetails = {
                name: selectedData.locationName,
                date: selectedData.date,
                lat: selectedData.latitude,
                lon: selectedData.longitude
            };
            // Add loading/error handling for polar plot if desired
            // Show loading indicators (optional)
            // document.getElementById('polar-loading-indicator-main').style.display = 'block';
            // document.getElementById('polar-error-indicator-main').style.display = 'none';
            // d3.select(`#${polarPlotContainerId}`).select("svg").remove(); // Clear previous plot

            try {
                 createPolarPlot(polarPlotContainerId, selectedData.polarData, locationDetails);
                 // Hide loading/error on success (optional)
                 // document.getElementById('polar-loading-indicator-main').style.display = 'none';
            } catch (error) {
                 console.error("Error creating polar plot:", error);
                 // Show error message (optional)
                 // document.getElementById('polar-loading-indicator-main').style.display = 'none';
                 // document.getElementById('polar-error-indicator-main').style.display = 'block';
            }


        } else {
            console.warn("Invalid selection or data not found for index:", selectElement.value);
            createHistogram(histogramCanvasId, []); // Clear histogram
            createPolarPlot(polarPlotContainerId, [], {}); // Clear polar plot
        }
    };

    // Add event listener
    selectElement.addEventListener('change', updateVisualizations); // Use renamed update function

    // Initial display (show histogram for the first item)
    if (featuredData.length > 0) {
        selectElement.value = '0'; // Select the first item
        updateVisualizations(); // Use renamed update function
    }
}


function clearStaticContent() {
    const sliderList = document.querySelector('.splide__list');
    if (sliderList) sliderList.innerHTML = '';
    const panoGalleryGrid = document.querySelector('.gallery-grid'); // Panorama gallery
    if (panoGalleryGrid) panoGalleryGrid.innerHTML = '';
    const astroGalleryGrid = document.querySelector('.astro-gallery-grid'); // Astro gallery
    if (astroGalleryGrid) astroGalleryGrid.innerHTML = '';
    const featuredSelect = document.getElementById('featuredLocationSelect');
    if (featuredSelect) featuredSelect.innerHTML = '';
}

// --- START: Lightbox Functions ---
let currentAstroGalleryIndex = 0;
let astroGalleryItems = [];

function updateLightboxView(index) {
    if (index < 0 || index >= astroGalleryItems.length) {
        console.warn("Index out of bounds for lightbox navigation:", index);
        return;
    }
    currentAstroGalleryIndex = index;
    const item = astroGalleryItems[index];
    const lightbox = document.getElementById('lightbox-overlay');
    if (!lightbox || !item) return;

    const imgElement = lightbox.querySelector('.lightbox-content img');
    const captionElement = lightbox.querySelector('.lightbox-caption');
    const osdLink = lightbox.querySelector('.lightbox-osd-link');
    const prevArrow = lightbox.querySelector('.lightbox-prev');
    const nextArrow = lightbox.querySelector('.lightbox-next');

    const mediumImagePath = `img/astrophotos/${item.mediumImageName}`;
    const fullImagePathForOSD = `img/astrophotos/${item.imageName}`;
    const caption = `${item.title} - ${item.date} | Camera: ${item.camera}, Telescope: ${item.telescope}`;
    const itemTitle = item.title;

    imgElement.src = mediumImagePath;
    imgElement.alt = caption || "Astrophotography Image";
    captionElement.textContent = caption || '';

    const osdViewerPageUrl = new URL('astro-osd-viewer.html', window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/');
    osdViewerPageUrl.searchParams.set('image', fullImagePathForOSD);
    if (itemTitle) osdViewerPageUrl.searchParams.set('title', itemTitle);
    if (caption) osdViewerPageUrl.searchParams.set('caption', caption);
    if (item.overlayImageName) { // Add this check
        osdViewerPageUrl.searchParams.set('overlayImage', item.overlayImageName);
    }
    osdLink.href = osdViewerPageUrl.toString();

    // Update arrow visibility
    if (prevArrow) prevArrow.style.display = (index === 0) ? 'none' : 'block';
    if (nextArrow) nextArrow.style.display = (index === astroGalleryItems.length - 1) ? 'none' : 'block';
}

function openLightbox(index, items) {
    astroGalleryItems = items;
    currentAstroGalleryIndex = index;

    let lightbox = document.getElementById('lightbox-overlay');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightbox-overlay';
        lightbox.className = 'lightbox-overlay';
        lightbox.innerHTML = `
            <button class="lightbox-prev" aria-label="Previous image">&#10094;</button>
            <div class="lightbox-content">
                <img src="" alt="Astrophoto Full Size" style="display: block; max-width: 100%; max-height: calc(90vh - 100px); object-fit: contain; border-radius: 3px; margin: auto;">
                <div class="lightbox-caption" style="margin-top:10px;"></div>
                <a href="#" class="btn lightbox-osd-link" style="display: block; width: fit-content; margin: 15px auto 0;">
                    <i class="fas fa-search-plus"></i> Immersive Pan & Zoom
                </a>
            </div>
            <button class="lightbox-next" aria-label="Next image">&#10095;</button>
            <button class="lightbox-close" aria-label="Close lightbox">&times;</button>
        `;
        document.body.appendChild(lightbox);
        lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
        lightbox.querySelector('.lightbox-prev').addEventListener('click', () => {
            if (currentAstroGalleryIndex > 0) {
                updateLightboxView(currentAstroGalleryIndex - 1);
            }
        });
        lightbox.querySelector('.lightbox-next').addEventListener('click', () => {
            if (currentAstroGalleryIndex < astroGalleryItems.length - 1) {
                updateLightboxView(currentAstroGalleryIndex + 1);
            }
        });
        lightbox.addEventListener('click', function(e) {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });
    }
    
    updateLightboxView(currentAstroGalleryIndex); // Load the initial image

    lightbox.style.display = 'flex';
    setTimeout(() => lightbox.classList.add('visible'), 10);
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox-overlay');
    if (lightbox) {
        lightbox.classList.remove('visible');
        setTimeout(() => {
            lightbox.style.display = 'none';
            const imgElement = lightbox.querySelector('.lightbox-content img');
            if (imgElement) imgElement.src = ""; // Clear image src
        }, 300); // Match CSS transition duration
    }
    document.body.style.overflow = '';
    astroGalleryItems = []; // Clear the items array
    currentAstroGalleryIndex = 0;
}
// --- END: Lightbox Functions ---

// --- START: Astro Gallery Initialization ---
function initAstroGallery(astroData) {
    const galleryGrid = document.querySelector('.astro-gallery-grid');
    if (!galleryGrid) {
        console.warn("Astro gallery grid not found. Skipping astro gallery initialization.");
        return;
    }
    galleryGrid.innerHTML = ''; // Clear existing items

    if (!astroData || astroData.length === 0) {
        galleryGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No astrophotography images available yet.</p>';
        return;
    }

    astroData.forEach((item, index) => { // Added index parameter
        const galleryItem = document.createElement('div');
        galleryItem.className = 'astro-gallery-item';
        
        const previewImagePath = `img/astrophotos/${item.previewName}`;
        // No longer need to construct all paths here, openLightbox will handle it via updateLightboxView

        galleryItem.innerHTML = `
            <img src="${previewImagePath}" alt="Preview of ${item.title}" loading="lazy" onerror="this.src='img/placeholder_thumbnail.jpg'; this.alt='Error loading preview';">
            <div class="astro-gallery-info">
                <h4>${item.title}</h4>
                <p>Date: ${item.date}</p>
                <p>Camera: ${item.camera}</p>
                <p>Telescope: ${item.telescope}</p>
            </div>
        `;
        galleryItem.addEventListener('click', () => {
            openLightbox(index, astroData); // Pass index and the full astroData array
        });
        galleryGrid.appendChild(galleryItem);
    });
}
// --- END: Astro Gallery Initialization ---


document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM Loaded. Initializing scripts.");
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', function() {
            navLinks.classList.toggle('active');
        });
    } else {
        console.warn("Mobile menu button or nav links not found.");
    }
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId.length > 1 && targetId.startsWith('#') && document.querySelector(targetId)) {
                e.preventDefault();
                const targetElement = document.querySelector(targetId);
                const headerOffset = 80; // Adjust if header height changes
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                window.scrollTo({
                     top: offsetPosition,
                     behavior: "smooth"
                });
                if (navLinks) {
                    navLinks.classList.remove('active'); // Close mobile menu on click
                }
            } else if (targetId === '#') {
                 e.preventDefault(); // Prevent jumping to top for href="#"
            }
        });
    });
    // Animation observer
    const sectionsToAnimate = document.querySelectorAll('section.slide-up');
    if (sectionsToAnimate.length > 0 && 'IntersectionObserver' in window) {
         const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        sectionsToAnimate.forEach(section => {
            observer.observe(section);
        });
    } else if (sectionsToAnimate.length > 0) {
        // Fallback for older browsers
        sectionsToAnimate.forEach(section => section.classList.add('visible'));
    }

    // Initialize map fullscreen button if it exists
    const mapFullscreenBtn = document.getElementById('map-fullscreen-btn');
    const mapContainer = document.querySelector('.map-container'); // Assuming this is the element to make fullscreen

    if (mapFullscreenBtn && mapContainer) {
        mapFullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement &&    // Standard
                !document.mozFullScreenElement && // Firefox
                !document.webkitFullscreenElement && // Chrome, Safari and Opera
                !document.msFullscreenElement) {  // IE/Edge
                // Request fullscreen
                if (mapContainer.requestFullscreen) {
                    mapContainer.requestFullscreen();
                } else if (mapContainer.mozRequestFullScreen) { /* Firefox */
                    mapContainer.mozRequestFullScreen();
                } else if (mapContainer.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                    mapContainer.webkitRequestFullscreen();
                } else if (mapContainer.msRequestFullscreen) { /* IE/Edge */
                    mapContainer.msRequestFullscreen();
                }
            } else {
                // Exit fullscreen
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.mozCancelFullScreen) { /* Firefox */
                    document.mozCancelFullScreen();
                } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
                    document.webkitExitFullscreen();
                } else if (document.msExitFullscreen) { /* IE/Edge */
                    document.msExitFullscreen();
                }
            }
        });

        // Update button icon based on fullscreen state
        function updateFullscreenButtonIcon() {
            const icon = mapFullscreenBtn.querySelector('i');
            if (document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
                icon.classList.remove('fa-expand');
                icon.classList.add('fa-compress');
                mapFullscreenBtn.title = "Exit Fullscreen Map";
            } else {
                icon.classList.remove('fa-compress');
                icon.classList.add('fa-expand');
                mapFullscreenBtn.title = "Toggle Fullscreen Map";
            }
        }

        document.addEventListener('fullscreenchange', updateFullscreenButtonIcon);
        document.addEventListener('mozfullscreenchange', updateFullscreenButtonIcon);
        document.addEventListener('webkitfullscreenchange', updateFullscreenButtonIcon);
        document.addEventListener('msfullscreenchange', updateFullscreenButtonIcon);
    }


    // Load data and initialize UI components
initSkyComparisonCardLinks(); // Initialize click handlers for the sky comparison cards
    loadAndProcessData();
});

function initMap(processedData) {
    if (typeof L === 'undefined') {
        console.error("Leaflet library not loaded.");
        return;
    }
    const mapElement = document.getElementById('lightPollutionMap');
    if (!mapElement) return;
    // Check if map is already initialized
    if (mapElement._leaflet_id) {
        console.warn("Map already initialized. Skipping re-initialization.");
        return;
    }
    const map = L.map(mapElement, {
        center: [47.0, 10.0], // Centered roughly on Europe
        zoom: 5,
        zoomControl: true, // Ensure zoom controls are enabled
        preferCanvas: true, // Better performance with many markers
        attributionControl: false // Disable default Leaflet attribution
    });
    // Add CartoDB Dark Matter base layer
    const cartoDBDarkMatter = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    });

    // Add CartoDB Positron (Light) base layer
    const cartoDBPositron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    });

    // --- Light Pollution Tile Layer ---
    const worldLPTileUrl = 'img/map_overlays/LP_2024/{z}/{x}/{y}.png';
    const worldLPLayer = L.tileLayer(worldLPTileUrl, {
        opacity: 0.75, // Set default opacity to 75%
        attribution: 'Light Pollution Data © VIIRS/NASA', // Update attribution as needed
        minZoom: 1, // Updated for LP_2024 tiles
        maxNativeZoom: 7, // Updated for LP_2024 tiles (1-7)
        maxZoom: 19, // Max zoom of the base map, allows over-zooming
        tms: false, // Assuming XYZ tiles, so TMS is false
        className: 'world-lp-tiles' // Add a custom class for styling
    });

    // Initialize MarkerCluster group
    const markers = L.markerClusterGroup({
        spiderfyOnMaxZoom: true, // Expand markers on max zoom
        showCoverageOnHover: false, // Optional: disable polygon hover effect
        zoomToBoundsOnClick: true // Zoom to bounds on cluster click
    });

    // Define base maps and overlays for layer control
    const openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    });

    const baseMaps = {
        "Dark Map": cartoDBDarkMatter,
        "Light Map": cartoDBPositron,
        "OpenStreetMap": openStreetMap
    };
    const overlayMaps = {
        "Observation Points": markers, // Now defined
        "World Light Pollution": worldLPLayer
    };

    // Add default base layer to map
    cartoDBDarkMatter.addTo(map);

    // Custom attribution removed, relying on tileLayer attribution.


    if (!processedData || processedData.length === 0) {
        console.warn("No processed data available to populate the map.");
        return;
    }

    // Add markers to the cluster group instead of the map directly
    processedData.forEach(item => {
        const representativeSqm = parseFloat(item.medianSqm); // Use medianSqm for coloring
        let markerColor;
        // Define colors based on SQM ranges (adjust ranges/colors as needed)
        if (isNaN(representativeSqm)) markerColor = '#808080'; // Grey for N/A
        else if (representativeSqm >= 21.76) markerColor = '#000000'; // Class 1
        else if (representativeSqm >= 21.6) markerColor = '#4D4D4D';  // Class 2
        else if (representativeSqm >= 21.3) markerColor = '#1F3A75';  // Class 3
        else if (representativeSqm >= 20.8) markerColor = '#004EB3';  // Class 4
        else if (representativeSqm >= 20.3) markerColor = '#2E8A00';  // Class 4.5
        else if (representativeSqm >= 19.25) markerColor = '#DADA00'; // Class 5
        else if (representativeSqm >= 18.5) markerColor = '#FF5600';  // Class 6
        else if (representativeSqm >= 18.0) markerColor = '#DF73FF';  // Class 7
        else markerColor = '#E5C9FF'; // Class 8/9

        let markerOptions = {
             radius: 8,
             fillColor: markerColor,
             color: markerColor === '#000000' ? '#CCCCCC' : '#000', // Outline for black markers
             weight: 1,
             opacity: 1,
             fillOpacity: 0.8
        };

        const marker = L.circleMarker([item.latitude, item.longitude], markerOptions); // Don't add to map yet

        // Create popup content
        let popupContent = `<h3>${item.locationName || item.locality || 'Unknown Location'}</h3>`;
        if (item.locality && item.region && item.country && item.locationName !== `${item.locality}, ${item.region}, ${item.country}`) {
             const structuredLocation = [item.locality, item.region, item.country].filter(Boolean).join(', ');
             if (structuredLocation) popupContent += `<p><small>${structuredLocation}</small></p>`;
        }
        popupContent += `<p><strong>Lat/Lon:</strong> ${item.latitude?.toFixed(4)}, ${item.longitude?.toFixed(4)}</p>`;
        popupContent += `<p><strong>Date:</strong> ${item.date}</p>`;
        popupContent += `<p><strong>Median SQM (Alt > 45°):</strong> ${item.medianSqm} mag/arcsec²</p>`; // Use medianSqm
        // Add Camera/Lens/Exposure details if available in the item object
        if (item.camera || item.lens || item.fStop || item.exposure || item.iso) {
             popupContent += `<p style="font-size: 0.9em; color: #ccc;">`; // Smaller text for details
             let details = [];
             if (item.camera) details.push(`Camera: ${item.camera}`);
             if (item.lens) details.push(`Lens: ${item.lens}mm`);
             if (item.fStop) details.push(`f/${item.fStop}`);
             if (item.exposure) details.push(`Exp: ${item.exposure}s`);
             if (item.iso) details.push(`ISO: ${item.iso}`);
             popupContent += details.join(' | ');
             popupContent += `</p>`;
        }
        popupContent += `<hr>`;

        // Prepare data for buttons (escape quotes for JS strings)
        const safeTitle = (item.locationName || item.locality || "Panorama").replace(/'/g, "\\'");
        const safeDate = (item.date || "N/A").replace(/'/g, "\\'");
        const safeMedianSqm = String(item.medianSqm).replace(/'/g, "\\'");
        const safePanoUrl = item.panoramaUrl ? item.panoramaUrl.replace(/'/g, "\\'") : '';
        const safeSqmFileUrl = item.sqmFileUrl ? item.sqmFileUrl.replace(/'/g, "\\'") : '';
        const safeLatitude = String(item.latitude || '').replace(/'/g, "\\'");
        const safeLongitude = String(item.longitude || '').replace(/'/g, "\\'");

        // Panorama Button - Calls viewPanorama which now navigates directly
        popupContent += `<button onclick="viewPanorama('${safeTitle}', '${safeDate}', '${safeMedianSqm}', '${safePanoUrl}', '${safeSqmFileUrl}', '${safeLatitude}', '${safeLongitude}')" class="btn btn-popup" ${!item.panoramaUrl ? 'disabled title="Panorama not available"' : ''}>`;
        popupContent += `<i class="fas fa-binoculars"></i> View Panorama`; // Removed date from button text
        popupContent += `</button>`;

        // Data Visualization Button
        // Encode parameters for URL
        const encodedSqmFile = encodeURIComponent(item.sqmFileUrl || '');
        const encodedLocation = encodeURIComponent(item.locationName || item.locality || 'Unknown');
        const encodedDate = encodeURIComponent(item.date || 'N/A');
        const encodedLat = encodeURIComponent(item.latitude || '');
        const encodedLon = encodeURIComponent(item.longitude || '');
        const encodedPanoUrl = encodeURIComponent(item.panoramaUrl || ''); // Add panorama URL
        const dataViewerUrl = `data-viewer.html?sqmFile=${encodedSqmFile}&location=${encodedLocation}&date=${encodedDate}&lat=${encodedLat}&lon=${encodedLon}&panoramaUrl=${encodedPanoUrl}`; // Added panoramaUrl param

        popupContent += `<button onclick="window.location.href='${dataViewerUrl}'" class="btn btn-popup btn-secondary" style="margin-top: 5px;" ${!item.sqmFileUrl ? 'disabled title="SQM data file not available"' : ''}>`;
        popupContent += `<i class="fas fa-chart-bar"></i> View Data Visualization`;
        popupContent += `</button>`;

        marker.bindPopup(popupContent, { maxWidth: 280 });
        markers.addLayer(marker); // Add the marker to the cluster group
    });

    // Add the cluster group to the map
    // map.addLayer(markers); // Markers are now part of overlayMaps, added via control or by default

    // Add Layer Control
    const layersControl = L.control.layers(baseMaps, overlayMaps, { position: 'bottomright' });
    layersControl.addTo(map);

    // Optionally, add some layers by default
    markers.addTo(map); // Show observation points by default
    worldLPLayer.addTo(map); // Show LP overlay by default

    // --- Dynamically add Opacity Slider to Layer Control ---
    // This needs to happen after the control is added to the map and rendered.
    // A slight delay might be necessary if elements aren't immediately available.
    setTimeout(() => {
        const controlContainer = layersControl.getContainer();
        const overlayLabels = controlContainer.querySelectorAll('.leaflet-control-layers-overlays label');

        overlayLabels.forEach(labelNode => {
            // Find the label for the Luxembourg Light Pollution layer
            // The text content includes the input checkbox, so we check for the layer name.
            if (labelNode.textContent && labelNode.textContent.includes("World Light Pollution")) {
                const sliderContainer = L.DomUtil.create('div', 'opacity-slider-container leaflet-control-layers-custom-item');
                
                const sliderInput = L.DomUtil.create('input', 'opacity-slider-input', sliderContainer);
                sliderInput.type = 'range';
                sliderInput.min = '0';
                sliderInput.max = '1';
                sliderInput.step = '0.05';
                sliderInput.value = worldLPLayer.options.opacity || 0.75; // Get current or default (75%)
                
                const valueDisplay = L.DomUtil.create('span', 'opacity-slider-value', sliderContainer);
                // Format initial value as percentage
                valueDisplay.textContent = Math.round(parseFloat(sliderInput.value) * 100) + '%';

                // Prevent map interactions when using the slider
                L.DomEvent.disableClickPropagation(sliderContainer);
                L.DomEvent.on(sliderContainer, 'wheel', L.DomEvent.stopPropagation);


                sliderInput.addEventListener('input', function() {
                    worldLPLayer.setOpacity(this.value); // Control the new layer's opacity
                    // Format displayed value as percentage
                    valueDisplay.textContent = Math.round(parseFloat(this.value) * 100) + '%';
                });

                // Insert the slider container after the label for this overlay
                labelNode.parentNode.insertBefore(sliderContainer, labelNode.nextSibling);
            }
        });
    }, 100); // 100ms delay, adjust if needed or find a Leaflet event for control ready

    // Add Legend
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'info legend leaflet-control-layers'); // Added leaflet-control-layers for base styling
        const legendHeader = L.DomUtil.create('div', 'legend-header', div); // Removed leaflet-control-layers-toggle
        // Use Material Icon "info" and remove text. Add a general class for the icon span.
        legendHeader.innerHTML = '<span class="legend-icon-span material-icons">info</span>';

        const legendContent = L.DomUtil.create('div', 'legend-content', div); // No longer starts collapsed by JS, CSS handles hover

        const legendData = [
            { sqm: "≥ 21.76", color: "#000000", outline: "#CCCCCC", label: "Class 1" },
            { sqm: "21.6–21.75", color: "#4D4D4D", label: "Class 2" },
            { sqm: "21.3–21.6", color: "#1F3A75", label: "Class 3" },
            { sqm: "20.8–21.3", color: "#004EB3", label: "Class 4" },
            { sqm: "20.3–20.8", color: "#2E8A00", label: "Class 4.5" },
            { sqm: "19.25–20.3", color: "#DADA00", label: "Class 5" },
            { sqm: "18.5–19.25", color: "#FF5600", label: "Class 6" },
            { sqm: "18.0–18.5", color: "#DF73FF", label: "Class 7" },
            { sqm: "< 18.0", color: "#E5C9FF", label: "Class 8/9" },
            { sqm: "N/A", color: "#808080", outline: "#FF0000", label: "No Data"} // Changed N/A color to grey for consistency
        ];

        let labels = []; // Subtitle for units removed
        legendData.forEach(item => {
            const outlineStyle = item.outline ? `border: 1px solid ${item.outline};` : '';
            labels.push(
                `<i style="background:${item.color}; ${outlineStyle} width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.8;"></i> ${item.sqm} (${item.label})`
            );
        });
        legendContent.innerHTML = labels.join('<br>');

        // Stop propagation to prevent map click when interacting with legend
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        // The onclick handler for legendHeader is removed as hover is handled by CSS.

        return div;
    };
    legend.addTo(map);
}


function initPanoramaSlider(featuredData) { // Changed to accept featuredData
    if (typeof Splide === 'undefined') {
         console.error("Splide library not loaded.");
         return null;
    }
    const splideElement = document.querySelector('.splide');
    const splideList = document.querySelector('.splide__list');
    if (!splideElement || !splideList) {
        console.warn("Splide container or list not found. Skipping slider initialization.");
        return null;
    }

    // Clear existing slides before adding new ones
    splideList.innerHTML = '';

    if (!featuredData || featuredData.length === 0) {
        splideElement.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No featured panoramas available.</p>';
        return null;
    }

    featuredData.forEach(item => { // Iterate over featuredData
        const slide = document.createElement('li');
        slide.className = 'splide__slide';
        // Store all necessary data attributes
        slide.dataset.title = item.locationName;
        slide.dataset.date = item.date;
        slide.dataset.latitude = item.latitude; // Add latitude to dataset
        slide.dataset.longitude = item.longitude; // Add longitude to dataset
        slide.dataset.sqm = item.medianSqm; // Use median SQM for display
        slide.dataset.panoramaUrl = item.panoramaUrl;
        slide.dataset.sqmFileUrl = item.sqmFileUrl;

        // Use item.previewUrl directly from the new manifest
        const actualPreviewUrl = item.previewUrl || item.panoramaUrl; // Fallback to panoramaUrl if previewUrl is missing

        slide.innerHTML = `
            <div class="pannellum-placeholder" data-panorama-url="${item.panoramaUrl}" data-preview-url="${actualPreviewUrl}">
                 <i class="fas fa-spinner fa-spin"></i>
                 <span>Loading Preview...</span>
             </div>
            <div class="panorama-info">
                <h4>${item.locationName || item.locality || 'Unknown Location'}</h4>
                <p>SQM: ${item.medianSqm} mag/arcsec² • ${item.date}</p>
            </div>
        `;
        splideList.appendChild(slide);
    });

    // Initialize or re-initialize Splide
    // Check if Splide instance already exists and destroy it
     if (splideElement.splideInstance) {
         splideElement.splideInstance.destroy(true); // true to remove Splide HTML elements
     }

    const splideInstance = new Splide(splideElement, {
        type       : 'loop', // Or 'slide' if loop is not desired
        perPage    : 3,      // Adjust as needed
        perMove    : 1,
        gap        : '1.5rem',
        pagination : false, // Hide pagination dots
        // arrows     : true,   // Ensure arrows are shown
        breakpoints: {
            992: { perPage: 2 }, // Adjust breakpoints as needed
            768: { perPage: 1 }
        }
    }).mount();

    // Store instance for potential future destruction/re-init
    splideElement.splideInstance = splideInstance;

    return splideList; // Return the list element for attaching listeners
}

function initSliderPannellumPlaceholders(containerElement) {
    if (typeof pannellum === 'undefined') {
        console.warn("Pannellum library not loaded. Skipping placeholders.");
        return;
    }
    if (!containerElement) return;

    containerElement.querySelectorAll('.pannellum-placeholder').forEach((placeholder, index) => {
        // Clear previous content/viewers if any
        placeholder.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Loading Preview...</span>';
        if (placeholder.pannellumViewer) {
            try {
                placeholder.pannellumViewer.destroy();
            } catch (e) { console.warn("Error destroying previous Pannellum viewer:", e); }
            placeholder.pannellumViewer = null;
        }

        const panoUrl = placeholder.dataset.panoramaUrl;
        const actualPanoUrl = placeholder.dataset.panoramaUrl; // Renamed for clarity
        const actualPreviewUrl = placeholder.dataset.previewUrl || actualPanoUrl; // Fallback

        if (placeholder && actualPanoUrl && actualPreviewUrl) {
            try {
                const config = {
                    "type": "equirectangular",
                    "panorama": actualPanoUrl,
                    "autoLoad": false,
                    "showControls": false,
                    "draggable": false,
                    "mouseZoom": false,
                    "hfov": 120,
                    "pitch": 0,
                    "yaw": 0,
                    "preview": actualPreviewUrl
                };
                // Store the viewer instance on the element itself
                placeholder.pannellumViewer = pannellum.viewer(placeholder, config);

                placeholder.pannellumViewer.on('load', () => {
                    // Remove loading indicator once loaded
                    const loadingIndicator = placeholder.querySelector('i, span');
                    if (loadingIndicator) placeholder.innerHTML = '';
                });
                placeholder.pannellumViewer.on('error', (err) => {
                    console.error(`Pannellum placeholder error for ${actualPanoUrl}:`, err);
                    placeholder.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>Preview Error</span>`;
                });
            } catch (e) {
                console.error(`Error initializing Pannellum placeholder for slide ${index}:`, e);
                placeholder.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>Preview Error</span>`;
            }
        } else {
             console.warn("Placeholder found but missing data-panorama-url or data-preview-url:", placeholder);
             placeholder.innerHTML = `<i class="fas fa-image"></i><span>Data Missing</span>`;
        }
    });
}

function addSliderClickListeners(containerElement) {
    if (!containerElement) return;

    // Remove any previously attached delegated listener (if applicable)
    // containerElement.removeEventListener('click', ...); // Need the exact function reference which we don't have here easily.
    // Instead, we'll iterate and attach directly, ensuring no duplicate listeners if run multiple times.

    containerElement.querySelectorAll('.splide__slide').forEach(slide => {
        // Check if a listener is already attached to this specific slide
        if (slide.dataset.clickListenerAttached === 'true') {
            return; // Skip if listener already exists
        }
        slide.dataset.clickListenerAttached = 'true'; // Mark as attached

        slide.addEventListener('click', function(event) {
            // Prevent Pannellum or other elements inside the slide from interfering
            event.stopPropagation();
            event.preventDefault(); // May not be strictly necessary but can help

            const currentSlide = this; // 'this' refers to the slide element
            const title = currentSlide.dataset.title || "Panorama";
            const date = currentSlide.dataset.date || "N/A";
            const sqm = currentSlide.dataset.sqm || "N/A"; // Median SQM from dataset
            const panoramaUrl = currentSlide.dataset.panoramaUrl;
            const sqmFileUrl = currentSlide.dataset.sqmFileUrl; // Needed for panorama viewer
            // Retrieve Lat/Lon from dataset
            const latitude = currentSlide.dataset.latitude;
            const longitude = currentSlide.dataset.longitude;


            if (!panoramaUrl) {
                 console.error("Could not find panorama URL for slide:", title);
                 alert("Panorama URL not found for this item.");
                 return;
            }
            console.log(`Direct slide click: Title=${title}, Date=${date}, SQM=${sqm}, URL=${panoramaUrl}`);

            // Call viewPanorama which now navigates directly
            viewPanorama(title, date, sqm, panoramaUrl, sqmFileUrl, latitude, longitude);
        });
    });
}

function initContactForm() {
    const form = document.getElementById('contactForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            // Basic placeholder submission
            alert('Thank you for your message! (Submission logic is a placeholder)');
            form.reset();
        });
    }
}

function initGallery(processedData) {
    const galleryGrid = document.querySelector('.gallery-grid');
    if (!galleryGrid) {
        console.warn("Gallery grid not found. Skipping gallery initialization.");
        return null;
    }

    // Clear existing gallery items
    galleryGrid.innerHTML = '';

    if (!processedData || processedData.length === 0) {
         galleryGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No panoramas available.</p>';
         return null;
    }

    processedData.forEach(item => {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item'; // Add a class for potential styling (e.g., cursor)
        galleryItem.style.cursor = 'pointer'; // Make it visually clickable

        // Prepare data for viewPanorama function call
        const safeTitle = (item.locationName || item.locality || "Panorama").replace(/'/g, "\\'");
        const safeDate = (item.date || "N/A").replace(/'/g, "\\'");
        const safeMedianSqm = String(item.medianSqm).replace(/'/g, "\\'");
        const safePanoUrl = item.panoramaUrl ? item.panoramaUrl.replace(/'/g, "\\'") : '';
        const safeSqmFileUrl = item.sqmFileUrl ? item.sqmFileUrl.replace(/'/g, "\\'") : '';
        const safeLatitude = String(item.latitude || '').replace(/'/g, "\\'");
        const safeLongitude = String(item.longitude || '').replace(/'/g, "\\'");

        // Use item.previewUrl directly from the new manifest
        const actualPreviewUrl = item.previewUrl || 'img/placeholder_thumbnail.jpg'; // Fallback to a generic placeholder

        // Set onclick handler for the entire item
        galleryItem.onclick = function() {
            // Ensure panorama URL exists before navigating
            if (item.panoramaUrl) {
                // Call viewPanorama which now navigates directly
                viewPanorama(safeTitle, safeDate, safeMedianSqm, safePanoUrl, safeSqmFileUrl, safeLatitude, safeLongitude);
            } else {
                console.warn(`Panorama URL missing for gallery item: ${safeTitle}`);
                // Optionally provide user feedback, e.g., disable the item visually or show an alert
                galleryItem.style.cursor = 'default'; // Indicate non-clickable
                galleryItem.style.opacity = '0.6';
            }
        };

        // Set innerHTML *without* the button
        galleryItem.innerHTML = `
            <img src="${actualPreviewUrl}" alt="Preview for ${item.locationName || item.locality}" loading="lazy" onerror="this.src='img/placeholder_thumbnail.jpg'; this.alt='Error loading preview';">
            <div class="gallery-info">
                <h4>${item.locationName || item.locality || 'Unknown Location'}</h4>
                <p>Date: ${item.date}</p>
                <p>Median SQM: ${item.medianSqm} mag/arcsec²</p>
                <!-- Button removed -->
            </div>
        `;
        // Add pointer cursor only if clickable
        if (item.panoramaUrl) {
             galleryItem.style.cursor = 'pointer';
        }

        galleryGrid.appendChild(galleryItem);
    });
    return galleryGrid;
}

// Function to handle clicks on sky comparison cards
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
        const sqmData = await fetchAndParseSqm(sqmFileUrl);
        const medianSqmValue = sqmData && sqmData.medianSqm !== null ? sqmData.medianSqm.toFixed(2) : '';
        viewPanorama(title, date, medianSqmValue, panoramaUrl, sqmFileUrl, latitude, longitude);
    } catch (error) {
        console.error("Error fetching or processing SQM data for sky comparison card:", error);
        // Fallback to opening without SQM value if processing fails
        viewPanorama(title, date, '', panoramaUrl, sqmFileUrl, latitude, longitude);
    }
}

// Initialize links for sky comparison cards
function initSkyComparisonCardLinks() {
    const skyCards = document.querySelectorAll('.sky-comparison-grid .sky-image-card');
    skyCards.forEach(card => {
        // Ensure cursor indicates interactivity (already in CSS, but good for JS backup)
        card.style.cursor = 'pointer'; 
        card.addEventListener('click', handleSkyComparisonCardClick);
    });
}

// Add to existing DOMContentLoaded or a suitable place
document.addEventListener('DOMContentLoaded', () => {
    // ... other initializations ...
    
    // Call the new init function
    // Ensure this is called after the main data processing if it depends on anything from it,
    // or if it's independent, can be called like other init functions.
    // For this specific case, these cards are static in index.html, so it can be called with other UI inits.
    
    // Assuming other init functions like initMap, initPanoramaSlider are called within initializeUI or similar
    // If initializeUI is the main hub:
    // (Inside initializeUI or after it if it's globally available and DOM is ready)
    // initSkyComparisonCardLinks(); 

    // For a standalone addition, if other initializations are complexly nested:
    // This ensures it runs after the DOM is ready.
    if (document.readyState === 'loading') { // Still loading
        document.addEventListener('DOMContentLoaded', initSkyComparisonCardLinks);
    } else { // DOMContentLoaded has already fired
        initSkyComparisonCardLinks();
    }
});
