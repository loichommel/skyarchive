// js/services/uiUtils.js
// Contains general UI utility functions and their initializations.

const SkyArchiveUIUtils = (() => {

    // Initializes the mobile menu toggle functionality.
    function initMobileMenu() {
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const navLinks = document.getElementById('navLinks');
        if (mobileMenuBtn && navLinks) {
            mobileMenuBtn.addEventListener('click', function() {
                navLinks.classList.toggle('active');
            });
        } else {
            console.warn("Mobile menu button or nav links not found for initMobileMenu.");
        }
    }

    // Initializes smooth scrolling for anchor links.
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const targetId = this.getAttribute('href');
                const navLinks = document.getElementById('navLinks');

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
                    if (navLinks && navLinks.classList.contains('active')) { // Close mobile menu
                        navLinks.classList.remove('active');
                    }
                } else if (targetId === '#') {
                     e.preventDefault(); // Prevent jump for href="#"
                }
            });
        });
    }

    // Initializes animations for sections to slide up when they become visible.
    function initSectionAnimations() {
        const sectionsToAnimate = document.querySelectorAll('section.slide-up');
        if (sectionsToAnimate.length > 0) {
            if ('IntersectionObserver' in window) {
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
            } else {
                // Fallback for older browsers
                sectionsToAnimate.forEach(section => section.classList.add('visible'));
            }
        }
    }

    // Initializes the fullscreen toggle button for the map.
    function initMapFullscreenButton() {
        const mapFullscreenBtn = document.getElementById('map-fullscreen-btn');
        const mapContainer = document.querySelector('.map-container');

        if (mapFullscreenBtn && mapContainer) {
            mapFullscreenBtn.addEventListener('click', () => {
                if (!document.fullscreenElement &&
                    !document.mozFullScreenElement &&
                    !document.webkitFullscreenElement &&
                    !document.msFullscreenElement) {
                    if (mapContainer.requestFullscreen) {
                        mapContainer.requestFullscreen();
                    } else if (mapContainer.mozRequestFullScreen) {
                        mapContainer.mozRequestFullScreen();
                    } else if (mapContainer.webkitRequestFullscreen) {
                        mapContainer.webkitRequestFullscreen();
                    } else if (mapContainer.msRequestFullscreen) {
                        mapContainer.msRequestFullscreen();
                    }
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.mozCancelFullScreen) {
                        document.mozCancelFullScreen();
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    } else if (document.msExitFullscreen) {
                        document.msExitFullscreen();
                    }
                }
            });

            function updateFullscreenButtonIcon() {
                const icon = mapFullscreenBtn.querySelector('i');
                if (!icon) return;
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
    }

    // Initializes all UI utility functions.
    function initializeAllUtils() {
        initMobileMenu();
        initSmoothScroll();
        initSectionAnimations();
        initMapFullscreenButton();
        console.log("UIUtils initialized.");
    }

    return {
        initMobileMenu,
        initSmoothScroll,
        initSectionAnimations,
        initMapFullscreenButton,
        initializeAllUtils
    };

})();

// Automatically initialize all utils on DOMContentLoaded.
document.addEventListener('DOMContentLoaded', SkyArchiveUIUtils.initializeAllUtils);
