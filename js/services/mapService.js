// js/services/mapService.js
// Handles initialization and interaction for the Leaflet map.

const SkyArchiveMapService = (() => {

    // Initializes the Leaflet map with tile layers, markers, and controls.
    // `processedData` is an array of panorama objects with location and SQM info.
    function initMap(processedData) {
        if (typeof L === 'undefined') {
            console.error("Leaflet library not loaded. Cannot initialize map.");
            return;
        }
        const mapElement = document.getElementById('lightPollutionMap');
        if (!mapElement) {
            console.warn("Map element 'lightPollutionMap' not found. Skipping map initialization.");
            return;
        }
        if (mapElement._leaflet_id) { // Check if map is already initialized
            console.warn("Map already initialized. Skipping re-initialization.");
            return;
        }

        const map = L.map(mapElement, {
            center: [47.0, 10.0], // Centered roughly on Europe
            zoom: 5,
            zoomControl: true,
            preferCanvas: true,
            attributionControl: false
        });

        // --- Base Tile Layers ---
        const cartoDBDarkMatter = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '', subdomains: 'abcd', maxZoom: 19
        });
        const cartoDBPositron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '', subdomains: 'abcd', maxZoom: 19
        });
        const openStreetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '', maxZoom: 19
        });

        // --- Overlay Tile Layers ---
        const worldLPTileUrl = 'img/map_overlays/LP_2024/{z}/{x}/{y}.png';
        const worldLPLayer = L.tileLayer(worldLPTileUrl, {
            opacity: 0.75, attribution: '', minZoom: 1, maxNativeZoom: 7, maxZoom: 19, tms: false, className: 'world-lp-tiles'
        });

        // --- Marker Cluster Group ---
        const markers = L.markerClusterGroup({
            spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true
        });

        const baseMaps = {
            "Dark Map": cartoDBDarkMatter,
            "Light Map": cartoDBPositron,
            "OpenStreetMap": openStreetMap
        };
        const overlayMaps = {
            "Observation Points": markers,
            "World Light Pollution": worldLPLayer
        };

        cartoDBDarkMatter.addTo(map); // Default base layer

        // --- Populate Markers ---
        if (!processedData || processedData.length === 0) {
            console.warn("No processed data available to populate the map markers.");
        } else {
            processedData.forEach(item => {
                const representativeSqm = parseFloat(item.medianSqm);
                let markerColor;
                if (isNaN(representativeSqm)) markerColor = '#808080';
                else if (representativeSqm >= 21.76) markerColor = '#000000';
                else if (representativeSqm >= 21.6) markerColor = '#4D4D4D';
                else if (representativeSqm >= 21.3) markerColor = '#1F3A75';
                else if (representativeSqm >= 20.8) markerColor = '#004EB3';
                else if (representativeSqm >= 20.3) markerColor = '#2E8A00';
                else if (representativeSqm >= 19.25) markerColor = '#DADA00';
                else if (representativeSqm >= 18.5) markerColor = '#FF5600';
                else if (representativeSqm >= 18.0) markerColor = '#DF73FF';
                else markerColor = '#E5C9FF';

                let markerOptions = {
                     radius: 8,
                     fillColor: markerColor,
                     color: markerColor === '#000000' ? '#CCCCCC' : '#000',
                     weight: 1,
                     opacity: 1,
                     fillOpacity: 0.8
                };

                const marker = L.circleMarker([item.latitude, item.longitude], markerOptions);

                let popupContent = `<h3>${item.locationName || item.locality || 'Unknown Location'}</h3>`;
                if (item.locality && item.region && item.country && item.locationName !== `${item.locality}, ${item.region}, ${item.country}`) {
                     const structuredLocation = [item.locality, item.region, item.country].filter(Boolean).join(', ');
                     if (structuredLocation) popupContent += `<p><small>${structuredLocation}</small></p>`;
                }
                popupContent += `<p><strong>Lat/Lon:</strong> ${item.latitude?.toFixed(4)}, ${item.longitude?.toFixed(4)}</p>`;
                popupContent += `<p><strong>Date:</strong> ${item.date}</p>`;
                popupContent += `<p><strong>Median SQM (Alt > 45°):</strong> ${item.medianSqm} mag/arcsec²</p>`;
                if (item.camera || item.lens || item.fStop || item.exposure || item.iso) {
                     popupContent += `<p style="font-size: 0.9em; color: #ccc;">`;
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

                const safeTitle = (item.locationName || item.locality || "Panorama").replace(/'/g, "\\'");
                const safeDate = (item.date || "N/A").replace(/'/g, "\\'");
                const safeMedianSqm = String(item.medianSqm).replace(/'/g, "\\'");
                const safePanoUrl = item.panoramaUrl ? item.panoramaUrl.replace(/'/g, "\\'") : '';
                const safeSqmFileUrl = item.sqmFileUrl ? item.sqmFileUrl.replace(/'/g, "\\'") : '';
                const safeLatitude = String(item.latitude || '').replace(/'/g, "\\'");
                const safeLongitude = String(item.longitude || '').replace(/'/g, "\\'");

                popupContent += `<button onclick="viewPanorama('${safeTitle}', '${safeDate}', '${safeMedianSqm}', '${safePanoUrl}', '${safeSqmFileUrl}', '${safeLatitude}', '${safeLongitude}')" class="btn btn-popup" ${!item.panoramaUrl ? 'disabled title="Panorama not available"' : ''}>`;
                popupContent += `<i class="fas fa-binoculars"></i> View Panorama`;
                popupContent += `</button>`;

                const encodedSqmFile = encodeURIComponent(item.sqmFileUrl || '');
                const encodedLocation = encodeURIComponent(item.locationName || item.locality || 'Unknown');
                const encodedDate = encodeURIComponent(item.date || 'N/A');
                const encodedLat = encodeURIComponent(item.latitude || '');
                const encodedLon = encodeURIComponent(item.longitude || '');
                const encodedPanoUrl = encodeURIComponent(item.panoramaUrl || '');
                const dataViewerUrl = `data-viewer.html?sqmFile=${encodedSqmFile}&location=${encodedLocation}&date=${encodedDate}&lat=${encodedLat}&lon=${encodedLon}&panoramaUrl=${encodedPanoUrl}`;

                popupContent += `<button onclick="window.location.href='${dataViewerUrl}'" class="btn btn-popup btn-secondary" style="margin-top: 5px;" ${!item.sqmFileUrl ? 'disabled title="SQM data file not available"' : ''}>`;
                popupContent += `<i class="fas fa-chart-bar"></i> View Data Visualization`;
                popupContent += `</button>`;

                marker.bindPopup(popupContent, { maxWidth: 280 });
                markers.addLayer(marker);
            });
        }

        const layersControl = L.control.layers(baseMaps, overlayMaps, { position: 'bottomright' });
        layersControl.addTo(map);

        markers.addTo(map);
        worldLPLayer.addTo(map);

        setTimeout(() => {
            const controlContainer = layersControl.getContainer();
            if (!controlContainer) {
                console.warn("Layer control container not found for opacity slider.");
                return;
            }
            const overlayLabels = controlContainer.querySelectorAll('.leaflet-control-layers-overlays label');
            overlayLabels.forEach(labelNode => {
                if (labelNode.textContent && labelNode.textContent.includes("World Light Pollution")) {
                    const sliderContainer = L.DomUtil.create('div', 'opacity-slider-container leaflet-control-layers-custom-item');
                    const sliderInput = L.DomUtil.create('input', 'opacity-slider-input', sliderContainer);
                    sliderInput.type = 'range';
                    sliderInput.min = '0';
                    sliderInput.max = '1';
                    sliderInput.step = '0.05';
                    sliderInput.value = worldLPLayer.options.opacity || 0.75;

                    const valueDisplay = L.DomUtil.create('span', 'opacity-slider-value', sliderContainer);
                    valueDisplay.textContent = Math.round(parseFloat(sliderInput.value) * 100) + '%';

                    L.DomEvent.disableClickPropagation(sliderContainer);
                    L.DomEvent.on(sliderContainer, 'wheel', L.DomEvent.stopPropagation);

                    sliderInput.addEventListener('input', function() {
                        worldLPLayer.setOpacity(this.value);
                        valueDisplay.textContent = Math.round(parseFloat(this.value) * 100) + '%';
                    });
                    labelNode.parentNode.insertBefore(sliderContainer, labelNode.nextSibling);
                }
            });
        }, 100);

        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'info legend leaflet-control-layers');
            const legendHeader = L.DomUtil.create('div', 'legend-header', div);
            legendHeader.innerHTML = '<span class="legend-icon-span material-icons">info</span>';
            const legendContent = L.DomUtil.create('div', 'legend-content', div);
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
                { sqm: "N/A", color: "#808080", outline: "#FF0000", label: "No Data"}
            ];
            let labelsHtml = [];
            legendData.forEach(item => {
                const outlineStyle = item.outline ? `border: 1px solid ${item.outline};` : '';
                labelsHtml.push(
                    `<i style="background:${item.color}; ${outlineStyle} width: 18px; height: 18px; float: left; margin-right: 8px; opacity: 0.8;"></i> ${item.sqm} (${item.label})`
                );
            });
            legendContent.innerHTML = labelsHtml.join('<br>');
            L.DomEvent.disableClickPropagation(div);
            L.DomEvent.disableScrollPropagation(div);
            return div;
        };
        legend.addTo(map);
        console.log("Map initialized by MapService.");
    }

    return {
        initMap: initMap
    };
})();
