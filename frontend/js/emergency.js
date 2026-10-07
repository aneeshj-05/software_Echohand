(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  let currentLocation = null;
  let alertTriggered  = false; // prevent duplicate triggers

  // ── Get location (returns a Promise) ────────────────────
  function fetchLocation() {
    return new Promise((resolve, reject) => {
      if (currentLocation) { resolve(currentLocation); return; }
      if (!navigator.geolocation) { reject('no-geo'); return; }
      navigator.geolocation.getCurrentPosition(
        pos => {
          currentLocation = {
            lat: pos.coords.latitude.toFixed(6),
            lng: pos.coords.longitude.toFixed(6)
          };
          resolve(currentLocation);
        },
        err => reject(err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  function mapsLink(loc) {
    if (!loc) return 'Location unavailable';
    return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  }

  function buildMessage(userName, contactName, loc) {
    return `🚨 EchoHand Emergency Alert 🚨\n\nHELP gesture detected!\nUser: ${userName}\n📍 Location: ${mapsLink(loc)}\n\nPlease respond immediately.`;
  }

  // ── Render contacts with WhatsApp links ─────────────────
  function renderContacts(loc) {
    const list = $('emergencyContactsList');
    if (!list) return;

    let contacts = [];
    try { contacts = JSON.parse(localStorage.getItem('echohand_contacts')) || []; } catch (_) {}

    const userName = (() => {
      try { return JSON.parse(localStorage.getItem('echohand_user'))?.name || 'EchoHand user'; } catch (_) { return 'EchoHand user'; }
    })();

    if (!contacts.length) {
      list.innerHTML = `<p class="emergency-no-contacts">
        No emergency contacts saved.
        <a href="login.html#signup">Add contacts</a> during sign-up.</p>`;
      return;
    }

    list.innerHTML = contacts.map(c => {
      const msg   = buildMessage(userName, c.name, loc);
      const waUrl = `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
      return `<a class="emergency-contact-item" href="${waUrl}" target="_blank" rel="noopener noreferrer">
        <div class="emergency-contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
        <div class="emergency-contact-info">
          <span class="emergency-contact-name">${c.name}</span>
          <span class="emergency-contact-phone">${c.phone}${c.relation ? ' · ' + c.relation : ''}</span>
        </div>
        <div class="emergency-wa-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Send Alert
        </div>
      </a>`;
    }).join('');
  }

  // ── Update location display in modal ────────────────────
  function updateLocationBox(loc) {
    const box  = $('emergencyLocationBox');
    const text = $('emergencyLocationText');
    if (!box || !text) return;
    box.hidden = false;
    const url  = mapsLink(loc);
    text.innerHTML = loc
      ? `📍 <strong>${loc.lat}, ${loc.lng}</strong> &nbsp;—&nbsp;
         <a href="${url}" target="_blank" rel="noopener noreferrer"
            style="color:#235347;text-decoration:underline;">Open in Maps</a>`
      : '📍 Location unavailable';
  }

  // ── Core trigger — called by HELP gesture OR manual button ──
  async function triggerEmergency(source) {
    // Open the modal
    window.EchoHandDashboard?.openModal('emergencyModal');

    // Show pulsing alert state
    const badge = $('emergencyHelpBadge');
    if (badge) badge.classList.add('is-alerting');

    // Fetch location
    const locText = $('emergencyLocationText');
    const locBox  = $('emergencyLocationBox');
    if (locBox)  locBox.hidden = false;
    if (locText) locText.textContent = '📍 Getting your location…';

    let loc = null;
    try {
      loc = await fetchLocation();
      updateLocationBox(loc);
    } catch (_) {
      if (locText) locText.textContent = '📍 Location unavailable — share manually.';
    }

    renderContacts(loc);

    if (source === 'gesture') {
      window.EchoHandSpeech?.speak('Help gesture detected. Sending emergency alert.');
    }
  }

  // ── Public: called by camera.js and glove.js on HELP ────
  function onHelpGesture() {
    if (alertTriggered) return;
    alertTriggered = true;
    triggerEmergency('gesture');
    // Re-arm after 30s so it can fire again
    setTimeout(() => { alertTriggered = false; }, 30000);
  }

  // ── Wire buttons ─────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Manual emergency button (big red button on dashboard)
    $('emergencyPanicBtn')?.addEventListener('click', () => triggerEmergency('manual'));

    // Get location button inside modal
    $('emergencyGetLocationBtn')?.addEventListener('click', async () => {
      const locText = $('emergencyLocationText');
      const locBox  = $('emergencyLocationBox');
      if (locBox)  locBox.hidden = false;
      if (locText) locText.textContent = '📍 Getting your location…';
      try {
        const loc = await fetchLocation();
        updateLocationBox(loc);
        renderContacts(loc);
      } catch (_) {
        if (locText) locText.textContent = '📍 Could not get location. Allow location access and retry.';
      }
    });

    // Re-render contacts when modal opens
    const modal = $('emergencyModal');
    if (modal) {
      new MutationObserver(() => {
        if (modal.classList.contains('is-open')) renderContacts(currentLocation);
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  });

  window.EchoHandEmergency = { onHelpGesture, triggerEmergency };

})();
