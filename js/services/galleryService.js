// js/services/galleryService.js
// Manages gallery and slider functionalities, including lightbox for astrophotos.

const SkyArchiveGalleryService = (() => {

    let currentAstroGalleryIndex = 0; // Tracks the current image index in the lightbox.
    let astroGalleryItems = []; // Stores the array of astrophoto items for lightbox navigation.

    // Updates the content of the lightbox with the image and details at the given index.
    function updateLightboxView(index) {
        if (index < 0 || index >= astroGalleryItems.length) {
            console.warn("Lightbox: Index out of bounds:", index);
            return;
        }
        currentAstroGalleryIndex = index;
        const item = astroGalleryItems[index];
        const lightbox = document.getElementById('lightbox-overlay');
        if (!lightbox || !item) {
            console.warn("Lightbox: Overlay or item not found for update.");
            return;
        }

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
        if (item.overlayImageName) {
            osdViewerPageUrl.searchParams.set('overlayImage', item.overlayImageName);
        }
        osdLink.href = osdViewerPageUrl.toString();

        if (prevArrow) prevArrow.style.display = (index === 0) ? 'none' : 'block';
        if (nextArrow) nextArrow.style.display = (index === astroGalleryItems.length - 1) ? 'none' : 'block';
    }

    // Opens the lightbox, creating it if it doesn't exist, and loads the image at the specified index.
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

        updateLightboxView(currentAstroGalleryIndex);

        lightbox.style.display = 'flex';
        setTimeout(() => lightbox.classList.add('visible'), 10); // For CSS transition
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    }

    // Closes the lightbox and restores page scrolling.
    function closeLightbox() {
        const lightbox = document.getElementById('lightbox-overlay');
        if (lightbox) {
            lightbox.classList.remove('visible');
            setTimeout(() => {
                lightbox.style.display = 'none';
                const imgElement = lightbox.querySelector('.lightbox-content img');
                if (imgElement) imgElement.src = ""; // Clear image to free memory
            }, 300); // Duration should match CSS transition
        }
        document.body.style.overflow = '';
        astroGalleryItems = [];
        currentAstroGalleryIndex = 0;
    }

    // Initializes the featured panorama slider using Splide.js.
    function initPanoramaSlider(featuredData) {
        if (typeof Splide === 'undefined') {
             console.error("Splide library not loaded for panorama slider.");
             return null;
        }
        const panoramaSection = document.getElementById('panoramas');
        if (!panoramaSection) {
            console.warn("Panorama section ('#panoramas') not found. Skipping panorama slider initialization.");
            return null;
        }
        const splideElement = panoramaSection.querySelector('.splide');
        if (!splideElement) {
            console.warn("Splide container for panoramas not found. Skipping slider init.");
            return null;
        }
        const splideList = splideElement.querySelector('.splide__list');
        if (!splideList) {
            console.warn("Splide list for panoramas not found. Skipping slider init.");
            return null;
        }
        splideList.innerHTML = '';
        if (!featuredData || featuredData.length === 0) {
            splideElement.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No featured panoramas available.</p>';
            return null;
        }

        featuredData.forEach(item => {
            const slide = document.createElement('li');
            slide.className = 'splide__slide';
            slide.dataset.title = item.locationName;
            slide.dataset.date = item.date;
            slide.dataset.latitude = item.latitude;
            slide.dataset.longitude = item.longitude;
            slide.dataset.sqm = item.medianSqm;
            slide.dataset.panoramaUrl = item.panoramaUrl;
            slide.dataset.sqmFileUrl = item.sqmFileUrl;
            const actualPreviewUrl = item.previewUrl || item.panoramaUrl;
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

        if (splideElement.splideInstance) {
             splideElement.splideInstance.destroy(true);
        }
        const splideInstance = new Splide(splideElement, {
            type: 'loop', perPage: 1, perMove: 1, gap: '1.5rem', pagination: true, arrows: true,
            autoplay: true, interval: 5000, pauseOnHover: true,
            breakpoints: { 992: { perPage: 2 }, 768: { perPage: 1 } }
        }).mount();
        splideElement.splideInstance = splideInstance;
        return splideList;
    }

    // Initializes Pannellum preview placeholders within a slider.
    function initSliderPannellumPlaceholders(containerElement) {
        if (typeof pannellum === 'undefined') {
            console.warn("Pannellum library not loaded. Skipping slider placeholders.");
            return;
        }
        if (!containerElement) return;
        containerElement.querySelectorAll('.pannellum-placeholder').forEach((placeholder, index) => {
            placeholder.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Loading Preview...</span>';
            if (placeholder.pannellumViewer) {
                try { placeholder.pannellumViewer.destroy(); } catch (e) { console.warn("Error destroying previous Pannellum viewer:", e); }
                placeholder.pannellumViewer = null;
            }
            const actualPanoUrl = placeholder.dataset.panoramaUrl;
            const actualPreviewUrl = placeholder.dataset.previewUrl || actualPanoUrl;
            if (placeholder && actualPanoUrl && actualPreviewUrl) {
                try {
                    const config = {"type": "equirectangular", "panorama": actualPanoUrl, "autoLoad": false, "showControls": false, "draggable": false, "mouseZoom": false, "hfov": 120, "pitch": 0, "yaw": 0, "preview": actualPreviewUrl};
                    placeholder.pannellumViewer = pannellum.viewer(placeholder, config);
                    placeholder.pannellumViewer.on('load', () => {
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
                 console.warn("Slider placeholder missing data-panorama-url or data-preview-url:", placeholder);
                 placeholder.innerHTML = `<i class="fas fa-image"></i><span>Data Missing</span>`;
            }
        });
    }

    // Adds click listeners to slider items to open panoramas.
    function addSliderClickListeners(containerElement) {
        if (!containerElement) return;
        containerElement.querySelectorAll('.splide__slide').forEach(slide => {
            if (slide.dataset.clickListenerAttached === 'true') return;
            slide.dataset.clickListenerAttached = 'true';
            slide.addEventListener('click', function(event) {
                event.stopPropagation(); event.preventDefault();
                const title = this.dataset.title || "Panorama";
                const date = this.dataset.date || "N/A";
                const sqm = this.dataset.sqm || "N/A";
                const panoramaUrl = this.dataset.panoramaUrl;
                const sqmFileUrl = this.dataset.sqmFileUrl;
                const latitude = this.dataset.latitude;
                const longitude = this.dataset.longitude;
                if (!panoramaUrl) {
                     console.error("Could not find panorama URL for slide:", title);
                     alert("Panorama URL not found for this item.");
                     return;
                }
                if (typeof viewPanorama === 'function') {
                    viewPanorama(title, date, sqm, panoramaUrl, sqmFileUrl, latitude, longitude);
                } else {
                    console.error("viewPanorama function not found globally.");
                }
            });
        });
    }

    // Initializes the main panorama gallery on panorama-gallery.html.
    function initGallery(processedData) {
        const galleryGrid = document.querySelector('.gallery-grid');
        if (!galleryGrid) return null;
        galleryGrid.innerHTML = '';
        if (!processedData || processedData.length === 0) {
             galleryGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No panoramas available.</p>';
             return null;
        }
        processedData.forEach(item => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'gallery-item';
            const safeTitle = (item.locationName || item.locality || "Panorama").replace(/'/g, "\\'");
            const safeDate = (item.date || "N/A").replace(/'/g, "\\'");
            const safeMedianSqm = String(item.medianSqm).replace(/'/g, "\\'");
            const safePanoUrl = item.panoramaUrl ? item.panoramaUrl.replace(/'/g, "\\'") : '';
            const safeSqmFileUrl = item.sqmFileUrl ? item.sqmFileUrl.replace(/'/g, "\\'") : '';
            const safeLatitude = String(item.latitude || '').replace(/'/g, "\\'");
            const safeLongitude = String(item.longitude || '').replace(/'/g, "\\'");
            const actualPreviewUrl = item.previewUrl || 'img/placeholder_thumbnail.jpg';
            galleryItem.onclick = function() {
                if (item.panoramaUrl && typeof viewPanorama === 'function') {
                    viewPanorama(safeTitle, safeDate, safeMedianSqm, safePanoUrl, safeSqmFileUrl, safeLatitude, safeLongitude);
                } else {
                    console.warn(`Panorama URL missing or viewPanorama function not found for gallery item: ${safeTitle}`);
                    if(!item.panoramaUrl) galleryItem.style.opacity = '0.6';
                }
            };
            galleryItem.innerHTML = `
                <img src="${actualPreviewUrl}" alt="Preview for ${item.locationName || item.locality}" loading="lazy" onerror="this.src='img/placeholder_thumbnail.jpg'; this.alt='Error loading preview';">
                <div class="gallery-info">
                    <h4>${item.locationName || item.locality || 'Unknown Location'}</h4>
                    <p>Date: ${item.date}</p>
                    <p>Median SQM: ${item.medianSqm} mag/arcsec²</p>
                </div>
            `;
            if (item.panoramaUrl) galleryItem.style.cursor = 'pointer';
            galleryGrid.appendChild(galleryItem);
        });
        return galleryGrid;
    }

    // Initializes the featured astrophotography slider on the homepage.
    function initFeaturedAstroGallery(astroData, maxItems) {
        if (typeof Splide === 'undefined') {
            console.error("Splide library not loaded for featured astro gallery.");
            return null;
        }
        const splideElement = document.getElementById('astro-photo-splide');
        if (!splideElement) {
            console.warn("Featured astrophoto Splide container not found. Skipping init.");
            return null;
        }
        const splideList = splideElement.querySelector('.splide__list');
        if (!splideList) {
            console.warn("Splide list for featured astrophotos not found. Skipping init.");
            return null;
        }
        splideList.innerHTML = '';
        if (!astroData || astroData.length === 0) {
            splideElement.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No featured astrophotography available.</p>';
            return null;
        }
        const itemsToFeature = astroData.slice(0, maxItems);
        itemsToFeature.forEach((item) => {
            const slide = document.createElement('li');
            slide.className = 'splide__slide astro-splide-item';
            const previewImagePath = `img/astrophotos/${item.previewName}`;
            slide.innerHTML = `
                <img src="${previewImagePath}" alt="Preview of ${item.title}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">
                <div class="panorama-info">
                    <h4>${item.title}</h4>
                    <p>${item.telescope}</p>
                </div>
            `;
            slide.addEventListener('click', () => {
                const originalIndex = astroData.findIndex(fullItem => fullItem.imageName === item.imageName);
                openLightbox(originalIndex, astroData);
            });
            splideList.appendChild(slide);
        });
        if (splideElement.splideInstance) {
            splideElement.splideInstance.destroy(true);
        }
        const astroSplideInstance = new Splide(splideElement, {
            type: 'loop', perPage: 3, perMove: 1, gap: '1rem', pagination: false,
            autoplay: true, interval: 5000, pauseOnHover: true,
            breakpoints: { 1024: { perPage: 2 }, 768: { perPage: 1 } }
        }).mount();
        splideElement.splideInstance = astroSplideInstance;
        console.log("Featured astrophoto gallery initialized by GalleryService.");
        return astroSplideInstance;
    }

    // Initializes the main astrophotography gallery on astro-gallery.html.
    function initAstroGallery(astroData) {
        const galleryGrid = document.querySelector('.astro-gallery-grid');
        if (!galleryGrid) {
            console.warn("Astro gallery grid not found. Skipping astro gallery init.");
            return;
        }
        galleryGrid.innerHTML = '';
        if (!astroData || astroData.length === 0) {
            galleryGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No astrophotography images available.</p>';
            return;
        }
        astroData.forEach((item, index) => {
            const galleryItem = document.createElement('div');
            galleryItem.className = 'astro-gallery-item';
            const previewImagePath = `img/astrophotos/${item.previewName}`;
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
                openLightbox(index, astroData);
            });
            galleryGrid.appendChild(galleryItem);
        });
        console.log("Astro gallery initialized by GalleryService.");
    }

    return {
        initPanoramaSlider,
        initSliderPannellumPlaceholders,
        addSliderClickListeners,
        initGallery,
        initAstroGallery,
        initFeaturedAstroGallery,
        openLightbox
    };

})();
