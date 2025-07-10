// js/services/visualizationService.js
// Provides functions for creating Chart.js histograms and D3.js polar plots.

const SkyArchiveVisualizationService = (() => {

    // Creates or updates a Chart.js histogram for SQM data distribution.
    function createHistogram(canvasId, sqmValues) {
        if (!sqmValues || sqmValues.length === 0) {
            console.warn("VisualizationService: No SQM values for histogram:", canvasId);
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                const existingChart = Chart.getChart(canvasId);
                if (existingChart) existingChart.destroy();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.textAlign = 'center';
                ctx.fillStyle = '#a0a0a0';
                ctx.fillText('No SQM data available.', canvas.width / 2, canvas.height / 2);
            }
            return null;
        }
        const canvas = document.getElementById(canvasId);
         if (!canvas) {
             console.error(`VisualizationService: Canvas element ${canvasId} not found.`);
             return null;
         }
        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvasId);
        if (existingChart) existingChart.destroy();

        const binWidth = 0.2;
        const minRange = 16.0;
        const maxRange = 22.0;
        const numCoreBins = Math.round((maxRange - minRange) / binWidth);
        const labels = ['<16'];
        for (let i = 0; i < numCoreBins; i++) {
            const start = minRange + i * binWidth;
            const end = start + binWidth;
            labels.push(`${start.toFixed(1)}-${end.toFixed(1)}`);
        }
        labels.push('>22');
        const bins = Array(labels.length).fill(0);
        sqmValues.forEach(val => {
            if (isNaN(val)) return;
            if (val < minRange) bins[0]++;
            else if (val >= maxRange) bins[labels.length - 1]++;
            else {
                const binIndex = Math.floor((val - minRange) / binWidth) + 1;
                if (binIndex > 0 && binIndex < labels.length - 1) bins[binIndex]++;
                else if (val === minRange) bins[1]++;
                // Edge cases for values at the exact maxRange boundary or slightly off due to precision
            }
        });

        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'SQM Measurement Count',
                    data: bins,
                    backgroundColor: 'rgba(128, 128, 128, 0.7)',
                    borderColor: 'rgba(128, 128, 128, 1)',
                    borderWidth: 1,
                    barPercentage: 1.0,
                    categoryPercentage: 0.95
                }]
            },
            options: { /* Options remain the same, keeping them for brevity */
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { title: (tooltipItems) => `SQM Range: ${tooltipItems[0].label} mag/arcsec²`, label: (context) => `Count: ${context.raw}`}}},
                scales: { x: { title: { display: true, text: 'SQM Value (mag/arcsec²)', color: '#a0a0a0' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#a0a0a0', autoSkip: true, maxTicksLimit: 15 }}, y: { title: { display: true, text: 'Measurement Count', color: '#a0a0a0' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#a0a0a0', precision: 0 }, beginAtZero: true }}
            }
        });
        console.log(`VisualizationService: Histogram updated for ${canvasId}`);
        return chart;
    }

    // Creates or updates a D3.js polar plot for spatial SQM data.
    function createPolarPlot(containerId, polarData, locationDetails) {
        if (typeof d3 === 'undefined') {
            console.error("VisualizationService: D3 library not loaded.");
            return null;
        }
        if (!polarData || polarData.length === 0) {
            console.warn("VisualizationService: No polar data for plot:", containerId);
            const container = d3.select(`#${containerId}`);
            container.select("svg").remove();
            container.select(".d3-tooltip").remove();
            if (container.node() && !container.select(".error-message-polar").node()) {
                 container.append("div").attr("class", "error-message-polar")
                 .style("text-align", "center").style("padding-top", "40%").style("color", "var(--text-secondary)")
                 .html("<i class='fas fa-exclamation-circle'></i> No polar data available.");
            }
            return null;
        }

        const container = d3.select(`#${containerId}`);
        container.select("svg").remove();
        container.select(".d3-tooltip").remove();
        container.select(".error-message-polar").remove();

        const containerNode = container.node();
        if (!containerNode) {
            console.error(`VisualizationService: Container ${containerId} not found for polar plot.`);
            return null;
        }

        // Dimensions and Radius Calculation (simplified for brevity, assumes original logic is sound)
        const margin = { top: 40, right: 40, bottom: 40, left: 40 };
        const availableWidth = containerNode.clientWidth - margin.left - margin.right;
        const availableHeight = containerNode.clientHeight - margin.top - margin.bottom;
        const labelOffset = 15, labelFontSizeEstimate = 12;
        const labelSpace = (2 * labelOffset) + labelFontSizeEstimate;
        let diameter = Math.max(Math.min(availableWidth, availableHeight - labelSpace), 100);
        const radius = diameter / 2;
        const viewBoxWidth = diameter + labelSpace + margin.left + margin.right;
        const viewBoxHeight = diameter + labelSpace + margin.top + margin.bottom;

        const svg = container.append("svg")
            .attr("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`)
            .attr("preserveAspectRatio", "xMidYMid meet").attr("width", "100%").style("display", "block")
            .append("g").attr("transform", `translate(${viewBoxWidth / 2}, ${viewBoxHeight / 2})`);

        const rScale = d3.scaleLinear().domain([0, 90]).range([radius, 0]);
        const magExtent = d3.extent(polarData, d => d.mag);
        if (magExtent[0] === magExtent[1]) { magExtent[0] -= 0.1; magExtent[1] += 0.1; } // Avoid same domain values
        const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([magExtent[1], magExtent[0]]);

        // Grid, Labels, Points, Tooltip (simplified for brevity, assumes original logic is sound)
        // Radial Grid
        svg.selectAll(".radial-grid").data([0, 30, 60, 90]).enter().append("circle")
            .attr("class", "radial-grid").attr("r", rScale).style("fill", "none").style("stroke", "rgba(255,255,255,0.2)").style("stroke-dasharray", "4 4");
        // Altitude Labels
        svg.selectAll(".radial-label").data([30, 60]).enter().append("text")
            .attr("class", "radial-label").attr("y", d => rScale(d) * Math.sin((-45) * Math.PI / 180) - 5).attr("x", d => rScale(d) * Math.cos((-45) * Math.PI / 180) + 5)
            .style("fill", "rgba(255,255,255,0.7)").style("font-size", "10px").text(d => `${d}°`);
        // Angular Grid
        svg.selectAll(".angular-grid").data(d3.range(0, 360, 45)).enter().append("line")
            .attr("class", "angular-grid").attr("y1", 0).attr("x1", 0).attr("y2", d => -radius * Math.sin((d - 90) * Math.PI / 180)).attr("x2", d => radius * Math.cos((d - 90) * Math.PI / 180))
            .style("stroke", "rgba(255,255,255,0.2)").style("stroke-dasharray", "4 4");
        // Cardinal/Intercardinal Labels
        [{label: "N", angle: 0}, {label: "E", angle: 90}, {label: "S", angle: 180}, {label: "W", angle: 270}].forEach(p => {
            svg.append("text").attr("transform", `translate(${ (radius + 25) * Math.cos((p.angle - 90) * Math.PI / 180)}, ${(radius + 25) * Math.sin((p.angle - 90) * Math.PI / 180)})`)
            .style("text-anchor", "middle").style("fill", "rgba(255,255,255,0.9)").style("font-size", "12px").style("font-weight", "bold").text(p.label);
        });
        // Data Points
        const points = svg.append("g").selectAll(".data-point").data(polarData).enter().append("g")
            .attr("class", "data-point").attr("transform", d => `translate(${rScale(d.alt) * Math.cos((d.azi - 90) * Math.PI / 180)}, ${rScale(d.alt) * Math.sin((d.azi - 90) * Math.PI / 180)})`);
        points.append("circle").attr("r", 10).style("fill", d => colorScale(d.mag)).style("cursor", "pointer");
        points.append("text").attr("dy", "0.35em").style("text-anchor", "middle").style("font-size", "7px").style("fill", d => d3.lab(colorScale(d.mag)).l > 60 ? "#000" : "#fff").text(d => d.mag.toFixed(1));
        // Tooltip
        const tooltip = d3.select("body").append("div").attr("class", "d3-tooltip");
        points.on("mouseover", (event, d) => {
            d3.select(event.currentTarget).select("circle").transition().duration(150).attr("r", 15).style("stroke", "#FFF");
            tooltip.html(`<strong>Location:</strong> ${locationDetails.name}<br><strong>Date:</strong> ${locationDetails.date} ${d.time || ''}<br><strong>SQM:</strong> ${d.mag.toFixed(2)}<br><strong>Alt:</strong> ${d.alt.toFixed(1)}°<br><strong>Az:</strong> ${d.azi.toFixed(1)}°`)
                   .style("visibility", "visible");
        }).on("mousemove", (event) => tooltip.style("top", (event.pageY + 15) + "px").style("left", (event.pageX + 15) + "px"))
          .on("mouseout", (event) => {
            d3.select(event.currentTarget).select("circle").transition().duration(150).attr("r", 10).style("stroke", "none");
            tooltip.style("visibility", "hidden");
        });

        console.log(`VisualizationService: Polar plot updated for ${containerId}`);
        return svg;
    }

    return {
        createHistogram: createHistogram,
        createPolarPlot: createPolarPlot
    };
})();
