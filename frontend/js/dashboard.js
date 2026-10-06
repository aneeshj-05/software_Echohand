/* =========================================================
   ECHOHAND DASHBOARD CONTROLLER
   ========================================================= */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ── User greeting ──────────────────────────────────────── */
  function loadUserName() {
    const greetingEl = $('dbGreeting');
    const nameEl     = $('dbUserName');

    let name = 'there';
    try {
      const saved = JSON.parse(localStorage.getItem('echohand_user'));
      if (saved?.name) name = saved.name.split(' ')[0];
    } catch (_) {}

    const hour = new Date().getHours();
    const tod  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    if (greetingEl) greetingEl.textContent = `${tod}, ${name}`;
    if (nameEl)     nameEl.textContent = name;
  }

  /* ── Modal system ───────────────────────────────────────── */
  function openModal(id) {
    // Close any other open modal first (one at a time)
    document.querySelectorAll('.eh-modal.is-open').forEach(m => {
      if (m.id !== id) _closeOne(m.id);
    });

    const modal = $(id);
    if (!modal) return;

    modal.classList.add('is-open');
    modal.removeAttribute('hidden');
    modal.setAttribute('aria-hidden', 'false');

    $('modalBackdrop')?.classList.add('is-open');

    // Lock page scroll while modal is open
    document.body.style.overflow = 'hidden';
  }

  function _closeOne(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function closeModal(id) {
    _closeOne(id);

    // Stop camera + inference when camera modal closes
    if (id === 'cameraModal') {
      window.EchoHandCamera?.stopCamera?.();
    }

    // Restore scroll only when no modal remains open
    const anyOpen = document.querySelector('.eh-modal.is-open');
    if (!anyOpen) {
      $('modalBackdrop')?.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  }

  /* ── Wire close buttons ─────────────────────────────────── */
  function setupModalClosing() {
    // Map each close button id → its modal id
    const map = {
      closeCameraModal:    'cameraModal',
      closeGloveModal:     'gloveModal',
      closeAslModal:       'aslModal',
      closeEmergencyModal: 'emergencyModal'
    };

    Object.entries(map).forEach(([btnId, modalId]) => {
      $(btnId)?.addEventListener('click', () => closeModal(modalId));
    });

    // Backdrop click
    $('modalBackdrop')?.addEventListener('click', () => {
      document.querySelectorAll('.eh-modal.is-open')
        .forEach(m => closeModal(m.id));
    });

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.eh-modal.is-open')
        .forEach(m => closeModal(m.id));
    });
  }

  /* ── Feature card buttons ───────────────────────────────── */
  function setupCardButtons() {
    $('openCameraBtn')?.addEventListener('click', () => {
      openModal('cameraModal');
      window.EchoHandCamera?.initialize?.();
    });

    $('openGloveBtn')?.addEventListener('click', () => {
      openModal('gloveModal');
      window.EchoHandGlove?.initialize?.();
    });
  }

  /* ── Sign out ───────────────────────────────────────────── */
  function setupLogout() {
    $('dbLogoutBtn')?.addEventListener('click', () => {
      localStorage.removeItem('echohand_logged_in');
      localStorage.removeItem('echohand_user');
      window.location.href = 'index.html';
    });
  }

  /* ── Guest banner ───────────────────────────────────────── */
  function setupGuestBanner() {
    const isLoggedIn = localStorage.getItem('echohand_logged_in') === 'true';
    const banner = $('guestBanner');
    if (!isLoggedIn && banner) banner.hidden = false;
  }

  /* ── Public API ─────────────────────────────────────────── */
  window.EchoHandDashboard = { openModal, closeModal };

  /* ── Init ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    loadUserName();
    setupGuestBanner();
    setupCardButtons();
    setupModalClosing();
    setupLogout();
  });

})();
