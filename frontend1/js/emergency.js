/* =========================================================
   ECHOHAND — Emergency Module
   ========================================================= */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  let currentLocation = null;

  /* ── Get browser location ─────────────────────────────── */
  function getLocation() {
    const box  = $('emergencyLocationBox');
    const text = $('emergencyLocationText');
    const alertBtn = $('emergencyAlertBtn');

    if (box)  box.hidden = false;
    if (text) text.textContent = '📍 Requesting your location…';

    if (!navigator.geolocation) {
      if (text) text.textContent = '⚠ Geolocation is not supported by this browser.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        currentLocation = {
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6)
        };
        const mapsUrl = `https://www.google.com/maps?q=${currentLocation.lat},${currentLocation.lng}`;
        if (text) {
          text.innerHTML = `📍 <strong>${currentLocation.lat}, ${currentLocation.lng}</strong>
            &nbsp;—&nbsp;<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer"
            style="color:#235347;text-decoration:underline;">Open in Maps</a>`;
        }
        if (alertBtn) alertBtn.hidden = false;
        renderContacts();
        EchoHand?.showToast('Location obtained. You can now send an alert.', 'mint', 3000);
      },
      err => {
        console.warn('Geolocation error:', err.message);
        if (text) text.textContent = '⚠ Location could not be obtained. Please allow location access and try again.';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  /* ── Build Google Maps link ───────────────────────────── */
  function mapsLink() {
    if (!currentLocation) return null;
    return `https://www.google.com/maps?q=${currentLocation.lat},${currentLocation.lng}`;
  }

  /* ── Render saved emergency contacts ─────────────────── */
  function renderContacts() {
    const list = $('emergencyContactsList');
    if (!list) return;

    let contacts = [];
    try {
      contacts = JSON.parse(localStorage.getItem('echohand_contacts')) || [];
    } catch (_) {}

    if (!contacts.length) {
      list.innerHTML = `<p style="font-size:0.82rem;color:#5a756d;padding:0 0 0.5rem;">
        No emergency contacts saved yet.
        <a href="login.html#signup" style="color:#235347;text-decoration:underline;">Add contacts</a>
        during sign-up.</p>`;
      return;
    }

    const userName = (() => {
      try { return JSON.parse(localStorage.getItem('echohand_user'))?.name || 'EchoHand user'; } catch (_) { return 'EchoHand user'; }
    })();

    list.innerHTML = contacts.map(c => {
      const msg = buildMessage(userName, c.name);
      const waUrl = `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
      return `<div class="emergency-contact-item">
        <div>
          <div class="emergency-contact-name">${c.name}</div>
          <div class="emergency-contact-phone">${c.phone}${c.relation ? ' · ' + c.relation : ''}</div>
        </div>
        <a class="emergency-whatsapp-btn" href="${waUrl}" target="_blank" rel="noopener noreferrer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          WhatsApp
        </a>
      </div>`;
    }).join('');
  }

  function buildMessage(userName, contactName) {
    const link = mapsLink();
    return `EchoHand Emergency Alert\n\nHELP gesture detected.\nUser: ${userName}\nContact: ${contactName}\nLocation: ${link || 'Not available'}`;
  }

  /* ── Wire up buttons ──────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    $('emergencyGetLocationBtn')?.addEventListener('click', getLocation);

    $('emergencyAlertBtn')?.addEventListener('click', () => {
      renderContacts();
      EchoHand?.showToast('Alert links prepared. Use WhatsApp buttons above.', 'mint', 3000);
    });

    // Render contacts whenever the emergency modal opens (no location needed for display)
    const observer = new MutationObserver(() => {
      const modal = $('emergencyModal');
      if (modal && modal.classList.contains('is-open')) renderContacts();
    });
    const modal = $('emergencyModal');
    if (modal) observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });

  window.EchoHandEmergency = { getLocation, mapsLink };

})();
