/**
 * ECHOHAND - Global Application Core Utilities
 * Theme switching, Web Speech API integration, Toast notifications, Geolocation helper
 */

const EchoHand = (() => {
  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initHeaderScroll();
    initMobileNav();
  });

  /**
   * Theme Management (Dark / Light high-contrast)
   */
  function initTheme() {
    const savedTheme = localStorage.getItem('echohand_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('echohand_theme', newTheme);
        updateThemeIcon(newTheme);
        showToast(`Theme switched to ${newTheme} mode`, 'cyan', 2000);
      });
    }
  }

  function updateThemeIcon(theme) {
    const iconContainer = document.getElementById('themeIcon');
    if (!iconContainer) return;
    if (theme === 'light') {
      iconContainer.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      `;
    } else {
      iconContainer.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      `;
    }
  }

  /**
   * Header Scroll Effect
   */
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  /**
   * Mobile Navigation Toggle
   */
  function initMobileNav() {
    const mobileBtn = document.getElementById('mobileNavToggle');
    const navMenu = document.querySelector('.nav-menu');
    if (!mobileBtn || !navMenu) return;

    mobileBtn.addEventListener('click', () => {
      navMenu.classList.toggle('is-active');
      const expanded = navMenu.classList.contains('is-active');
      mobileBtn.setAttribute('aria-expanded', expanded);
    });
  }

  /**
   * Native Web Speech API Synthesis
   */
  function speakText(text, onStart, onEnd) {
    if (!('speechSynthesis' in window)) {
      showToast('Speech synthesis not supported in this browser.', 'crimson');
      return;
    }

    // Cancel ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    // Pick best English voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (naturalVoice) utterance.voice = naturalVoice;

    if (typeof onStart === 'function') utterance.onstart = onStart;
    if (typeof onEnd === 'function') utterance.onend = onEnd;
    utterance.onerror = (e) => {
      console.warn('Speech synthesis error:', e);
      if (typeof onEnd === 'function') onEnd();
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Toast Notifications System
   */
  function showToast(message, type = 'cyan', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'emerald') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'crimson') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }

  /**
   * Browser Geolocation Helper with Fallback
   */
  function getCurrentLocation() {
    return new Promise((resolve) => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              lat: pos.coords.latitude.toFixed(6),
              lng: pos.coords.longitude.toFixed(6),
              accuracy: pos.coords.accuracy,
              source: 'gps'
            });
          },
          (err) => {
            console.warn('Geolocation denied or unavailable, using high-accuracy fallback:', err.message);
            // Default demo coordinate (e.g. San Francisco Tech Hub or central city)
            resolve({
              lat: '37.774929',
              lng: '-122.419416',
              accuracy: 25,
              source: 'simulated'
            });
          },
          { timeout: 7000, enableHighAccuracy: true }
        );
      } else {
        resolve({
          lat: '37.774929',
          lng: '-122.419416',
          accuracy: 50,
          source: 'simulated'
        });
      }
    });
  }

  // Public API
  return {
    speakText,
    showToast,
    getCurrentLocation
  };
})();
