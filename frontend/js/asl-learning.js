/* =========================================================
   ECHOHAND — ASL Learning (inline expand panel)
   ========================================================= */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ── SVG hand icons keyed by gesture ─────────────────── */
  const ICONS = {
    'HELLO': `<svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="38" width="36" height="38" rx="10" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="10" y="44" width="14" height="9" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="24" y="16" width="9" height="26" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="35" y="12" width="9" height="28" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="46" y="16" width="9" height="26" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="57" y="22" width="8" height="20" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <path d="M58 20 Q72 10 68 28" stroke="#235347" stroke-width="1.2" stroke-dasharray="3 2" fill="none"/>
    </svg>`,

    'THANK YOU': `<svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="36" width="40" height="34" rx="10" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="8" y="42" width="14" height="9" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="22" y="18" width="9" height="22" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="33" y="15" width="9" height="24" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="44" y="18" width="9" height="22" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="55" y="22" width="8" height="18" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <path d="M40 74 L40 84 M36 80 L40 84 L44 80" stroke="#235347" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

    'YES': `<svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="30" width="36" height="40" rx="12" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="24" y="22" width="8" height="12" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="34" y="20" width="8" height="13" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="44" y="22" width="8" height="12" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="10" y="36" width="14" height="9" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <path d="M40 74 L40 82 M36 78 L40 82 L44 78" stroke="#235347" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M40 18 L40 10 M36 14 L40 10 L44 14" stroke="#235347" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,

    'NO': `<svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="42" width="36" height="32" rx="10" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="8" y="46" width="16" height="9" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="24" y="18" width="9" height="28" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="35" y="14" width="9" height="30" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="46" y="36" width="9" height="10" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="56" y="38" width="8" height="9" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <path d="M28 46 Q20 52 28 56" stroke="#235347" stroke-width="1.2" stroke-dasharray="3 2" fill="none"/>
    </svg>`,

    'I LOVE YOU': `<svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="22" y="40" width="36" height="34" rx="10" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="8" y="44" width="16" height="9" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="24" y="14" width="9" height="30" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="35" y="34" width="9" height="10" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="46" y="36" width="9" height="9" rx="4.5" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="57" y="18" width="8" height="26" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
    </svg>`,

    'HELP': `<svg viewBox="0 0 80 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="52" width="40" height="28" rx="12" fill="#c2d9c8" stroke="#235347" stroke-width="1.5"/>
      <rect x="16" y="30" width="48" height="26" rx="10" fill="#b8dfc2" stroke="#235347" stroke-width="2"/>
      <rect x="20" y="14" width="8" height="18" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="30" y="10" width="8" height="22" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="40" y="12" width="8" height="20" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <rect x="50" y="16" width="8" height="16" rx="4" fill="#b8dfc2" stroke="#235347" stroke-width="1.5"/>
      <path d="M40 82 L40 90 M36 86 L40 90 L44 86" stroke="#80564f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`
  };

  /* ── Lesson data ──────────────────────────────────────── */
  const LESSONS = {
    'HELLO': {
      label: 'Greeting',
      steps: [
        { title: 'Raise your dominant hand', text: 'Lift your dominant hand up near the side of your forehead, fingers together, palm facing outward.' },
        { title: 'Open your fingers', text: 'Spread your fingers slightly and keep your palm facing away from you.' },
        { title: 'Sweep your hand outward', text: 'Move your hand smoothly away from your head in a small arc, like a salute. That\'s HELLO!' }
      ]
    },
    'THANK YOU': {
      label: 'Gratitude',
      steps: [
        { title: 'Flat hand at your chin', text: 'Hold your dominant hand flat, fingers together, touching your chin with your fingertips.' },
        { title: 'Move forward and down', text: 'Extend your hand forward and slightly downward, away from your face.' },
        { title: 'Finish the motion', text: 'Complete the smooth outward movement. The gesture resembles blowing a kiss of gratitude.' }
      ]
    },
    'YES': {
      label: 'Affirmation',
      steps: [
        { title: 'Make a fist', text: 'Close your dominant hand into a relaxed fist, thumb resting on the side.' },
        { title: 'Nod your fist', text: 'Bend your wrist to move your fist up and down, mimicking a nodding motion.' },
        { title: 'Repeat naturally', text: 'Do the nod two or three times in a smooth, natural rhythm. That\'s YES!' }
      ]
    },
    'NO': {
      label: 'Negation',
      steps: [
        { title: 'Extend index and middle fingers', text: 'Hold your dominant hand up with your index and middle fingers extended and together.' },
        { title: 'Extend your thumb', text: 'Also extend your thumb outward, forming a shape like the letter "N" or a snap position.' },
        { title: 'Snap fingers to thumb', text: 'Quickly bring your index and middle fingers down to tap your thumb twice. That\'s NO!' }
      ]
    },
    'I LOVE YOU': {
      label: 'Affection',
      steps: [
        { title: 'Extend thumb, index, and little finger', text: 'Hold up your dominant hand and extend your thumb, index finger, and little finger. Keep your middle and ring fingers folded down.' },
        { title: 'Face your palm outward', text: 'Rotate your hand so your palm faces the person you are signing to.' },
        { title: 'Hold the shape', text: 'Hold the handshape steady. This single sign combines I, L, and Y — meaning I LOVE YOU!' }
      ]
    },
    'HELP': {
      label: '⚠ Emergency Gesture',
      isEmergency: true,
      steps: [
        { title: 'Make a fist with one hand', text: 'Close your non-dominant hand into a fist with the thumb pointing upward.' },
        { title: 'Place flat hand on top', text: 'Rest your dominant hand flat on top of the fist, palm down, fingers pointing forward.' },
        { title: 'Lift both hands upward', text: 'Raise both hands together in an upward motion. This is the ASL sign for HELP — use it to signal that you need assistance.' }
      ]
    }
  };

  let activeGesture = null;
  let activeStep = 0;

  /* ── Render the expand panel for a gesture ───────────── */
  function openPanel(gesture) {
    const lesson = LESSONS[gesture];
    if (!lesson) return;

    activeGesture = gesture;
    activeStep = 0;

    // Mark active card
    document.querySelectorAll('.asl-card').forEach(c => {
      c.classList.toggle('is-active', c.dataset.gesture === gesture);
      c.setAttribute('aria-expanded', c.dataset.gesture === gesture ? 'true' : 'false');
    });

    renderStep();

    const panel = $('aslExpandPanel');
    if (panel) {
      panel.hidden = false;
      // Scroll panel into view smoothly
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  }

  function closePanel() {
    const panel = $('aslExpandPanel');
    if (panel) panel.hidden = true;
    document.querySelectorAll('.asl-card').forEach(c => {
      c.classList.remove('is-active');
      c.setAttribute('aria-expanded', 'false');
    });
    activeGesture = null;
    activeStep = 0;
  }

  function renderStep() {
    const lesson = LESSONS[activeGesture];
    if (!lesson) return;
    const step = lesson.steps[activeStep];
    if (!step) return;

    // Header
    const iconEl = $('aslExpandIcon');
    if (iconEl) iconEl.innerHTML = ICONS[activeGesture] || '';

    const titleEl = $('aslExpandTitle');
    if (titleEl) titleEl.textContent = activeGesture;

    const badgeEl = $('aslExpandBadge');
    if (badgeEl) {
      badgeEl.textContent = lesson.label;
      badgeEl.className = 'asl-expand-badge' + (lesson.isEmergency ? ' is-emergency' : '');
    }

    // Visual (large icon)
    const visualEl = $('aslExpandVisual');
    if (visualEl) visualEl.innerHTML = ICONS[activeGesture] || '';

    // Step copy
    const labelEl = $('aslExpandStepLabel');
    if (labelEl) labelEl.textContent = `Step ${activeStep + 1} of ${lesson.steps.length}`;

    const stepTitleEl = $('aslExpandStepTitle');
    if (stepTitleEl) stepTitleEl.textContent = step.title;

    const stepTextEl = $('aslExpandStepText');
    if (stepTextEl) stepTextEl.textContent = step.text;

    // Counter
    const counter = $('aslExpandCounter');
    if (counter) counter.textContent = `${activeStep + 1} / ${lesson.steps.length}`;

    // Button states
    const prevBtn = $('aslExpandPrev');
    const nextBtn = $('aslExpandNext');
    if (prevBtn) prevBtn.disabled = activeStep === 0;
    if (nextBtn) nextBtn.textContent = activeStep === lesson.steps.length - 1 ? 'Finish ✓' : 'Next →';
  }

  /* ── Wire up events ───────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    // Card clicks
    document.querySelectorAll('.asl-card').forEach(card => {
      card.addEventListener('click', () => {
        const gesture = card.dataset.gesture;
        if (activeGesture === gesture) {
          closePanel(); // toggle off if same card clicked again
        } else {
          openPanel(gesture);
        }
      });
    });

    // Close button
    $('aslExpandClose')?.addEventListener('click', closePanel);

    // Prev / Next
    $('aslExpandPrev')?.addEventListener('click', () => {
      if (activeStep > 0) { activeStep--; renderStep(); }
    });

    $('aslExpandNext')?.addEventListener('click', () => {
      const lesson = LESSONS[activeGesture];
      if (!lesson) return;
      if (activeStep < lesson.steps.length - 1) {
        activeStep++;
        renderStep();
      } else {
        closePanel();
      }
    });

    // Scroll arrows for the card track
    $('aslScrollPrev')?.addEventListener('click', () => {
      $('aslCardTrack')?.scrollBy({ left: -220, behavior: 'smooth' });
    });
    $('aslScrollNext')?.addEventListener('click', () => {
      $('aslCardTrack')?.scrollBy({ left: 220, behavior: 'smooth' });
    });

    // Escape key closes panel
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && activeGesture) closePanel();
    });
  });

  // Public API
  window.EchoHandASL = { openPanel, closePanel };

})();
