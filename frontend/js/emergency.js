/**
 * ECHOHAND - Emergency System
 * Device registration (Emergency Help) is separate from emergency alert dispatch.
 */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  let currentLocation = null;
  let alertTriggered = false;

  const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:')
    ? 'http://127.0.0.1:5000'
    : '';

  function fetchLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
      navigator.geolocation.getCurrentPosition(
        pos => {
          currentLocation = {
            lat: pos.coords.latitude.toFixed(6),
            lng: pos.coords.longitude.toFixed(6)
          };
          resolve(currentLocation);
        },
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  function mapsLink(loc) {
    if (!loc) return '';
    return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  }

  function resetEmergencyStatusUi() {
    const box = $('emergencyStatusBox');
    const locBox = $('emergencyLocationBox');
    const badge = $('emergencyHelpBadge');
    if (box) {
      box.hidden = true;
      box.className = 'emergency-status-box';
    }
    if (locBox) locBox.hidden = true;
    if (badge) badge.classList.remove('is-alerting');
  }

  function updateStatus(state, message) {
    const box = $('emergencyStatusBox');
    const text = $('emergencyStatusText');
    if (!box || !text) return;

    box.hidden = false;
    box.className = 'emergency-status-box';

    if (state === 'loading') {
      box.classList.add('is-loading');
      text.innerHTML = `<span class="emergency-spinner" aria-hidden="true"></span> ${message}`;
    } else if (state === 'success') {
      box.classList.add('is-success');
      text.innerHTML = `<strong>✅ ${message}</strong>`;
    } else if (state === 'error') {
      box.classList.add('is-error');
      text.innerHTML = `<strong>⚠️ ${message}</strong>`;
    } else {
      text.textContent = message;
    }
  }

  function updateLocationBox(loc) {
    const box = $('emergencyLocationBox');
    const text = $('emergencyLocationText');
    if (!box || !text) return;
    box.hidden = false;
    const url = mapsLink(loc);
    text.innerHTML = loc
      ? `📍 <strong>${loc.lat}, ${loc.lng}</strong> &nbsp;—&nbsp;
         <a href="${url}" target="_blank" rel="noopener noreferrer"
            style="color:#235347;text-decoration:underline;font-weight:600;">Open in Google Maps</a>`
      : '📍 Location unavailable';
  }

  async function sendBackendEmergencyAlert(source, loc) {
    const token = localStorage.getItem('echohand_token');

    if (!token) {
      return {
        success: false,
        message: 'Please sign in to send emergency alerts to registered contacts.'
      };
    }

    const payload = {
      source: source || 'manual',
      latitude: loc ? parseFloat(loc.lat) : null,
      longitude: loc ? parseFloat(loc.lng) : null
    };

    try {
      const response = await fetch(`${API_BASE}/api/emergency/alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        return {
          success: false,
          message: data.message || `Failed to dispatch alert (${response.status})`
        };
      }

      return {
        success: true,
        message: data.message || 'Emergency alert sent successfully.',
        contactsNotified: data.contacts_notified || 0,
        tokensSent: data.tokens_sent || 0
      };
    } catch (err) {
      console.error('[EchoHand Emergency] Network error sending alert:', err);
      return {
        success: false,
        message: 'Could not reach EchoHand server. Check network connection.'
      };
    }
  }

  function renderContacts() {
    const list = $('emergencyContactsList');
    if (!list) return;

    let contacts = [];
    try { contacts = JSON.parse(localStorage.getItem('echohand_contacts')) || []; } catch (_) {}

    if (!contacts.length) {
      list.innerHTML = `<div class="emergency-no-contacts">
        <p>No emergency contacts saved.</p>
        <a href="login.html#signup" class="btn btn-secondary btn-sm" style="margin-top:0.5rem;">Add Emergency Contacts</a>
      </div>`;
      return;
    }

    list.innerHTML = contacts.map(c => {
      const tokens = c.fcm_tokens || c.fcmTokens || [];
      const hasDevice = Array.isArray(tokens) && tokens.length > 0;
      const deviceLabel = hasDevice
        ? `<span class="contact-fcm-pill is-active">🔔 Notifications Active</span>`
        : `<span class="contact-fcm-pill is-inactive">Notifications not enabled on this device yet</span>`;

      return `
        <div class="emergency-contact-card" data-contact-id="${c.id}">
          <div class="emergency-contact-main">
            <div class="emergency-contact-avatar">${(c.name || 'C').charAt(0).toUpperCase()}</div>
            <div class="emergency-contact-info">
              <div class="emergency-contact-title-row">
                <span class="emergency-contact-name">${c.name}</span>
                ${c.isPrimary || c.is_primary ? '<span class="primary-tag">Primary</span>' : ''}
              </div>
              <span class="emergency-contact-meta">${c.relation ? c.relation : 'Emergency contact'}</span>
              <div class="emergency-contact-status-row">${deviceLabel}</div>
            </div>
          </div>
          <div class="emergency-contact-actions">
            <button type="button" class="btn btn-primary btn-sm btn-enable-device" data-contact-id="${c.id}">
              Enable on This Device
            </button>
          </div>
          <details class="emergency-contact-optional">
            <summary>Optional backup (not required for push alerts)</summary>
            <div class="emergency-contact-optional-body">
              <button type="button" class="btn btn-outline btn-xs btn-copy-invite" data-contact-id="${c.id}">
                Share Invite Link
              </button>
            </div>
          </details>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.btn-enable-device').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cId = parseInt(btn.dataset.contactId, 10);
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Enabling…';
        try {
          if (!window.EchoHandFCM) throw new Error('Firebase messaging not initialized.');
          const res = await window.EchoHandFCM.registerWithBackend({ contactId: cId });
          window.EchoHand?.showToast?.(res.message || 'Device registered successfully!', 'mint', 3500);
          btn.textContent = '✅ Notifications Active';
          await refreshUserProfileContacts();
        } catch (err) {
          window.EchoHand?.showToast?.(err.message || 'Failed to enable notifications.', 'crimson', 5000);
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });

    list.querySelectorAll('.btn-copy-invite').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cId = parseInt(btn.dataset.contactId, 10);
        btn.disabled = true;
        try {
          if (!window.EchoHandFCM) throw new Error('Firebase messaging module unavailable.');
          const info = await window.EchoHandFCM.generateInviteLink(cId);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(info.inviteUrl);
            window.EchoHand?.showToast?.('Invite link copied (optional backup).', 'mint', 3500);
          } else {
            prompt('Copy this optional invite link:', info.inviteUrl);
          }
        } catch (err) {
          window.EchoHand?.showToast?.(err.message || 'Could not generate invite link.', 'crimson', 3500);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function refreshUserProfileContacts() {
    const token = localStorage.getItem('echohand_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user && data.user.emergencyContacts) {
          localStorage.setItem('echohand_contacts', JSON.stringify(data.user.emergencyContacts));
          localStorage.setItem('echohand_user', JSON.stringify(data.user));
          renderContacts();
        }
      }
    } catch (_) {}
  }

  /** Opens Emergency Help for contact/notification setup only — no GPS, no alert. */
  function openEmergencyHelpModal() {
    resetEmergencyStatusUi();
    window.EchoHandDashboard?.openModal('emergencyModal');
    renderContacts();
    refreshUserProfileContacts();
  }

  async function triggerEmergency(source) {
    window.EchoHandDashboard?.openModal('emergencyModal');

    const badge = $('emergencyHelpBadge');
    if (badge) badge.classList.add('is-alerting');

    updateStatus('loading', 'Getting your location…');

    const locText = $('emergencyLocationText');
    const locBox = $('emergencyLocationBox');
    if (locBox) locBox.hidden = false;
    if (locText) locText.textContent = '📍 Acquiring GPS coordinates…';

    let loc = null;
    try {
      loc = await fetchLocation();
      updateLocationBox(loc);
    } catch (_) {
      if (locText) locText.textContent = '📍 Location unavailable — alert will be sent without coordinates.';
    }

    updateStatus('loading', 'Sending emergency alert…');

    if (source === 'gesture') {
      window.EchoHandSpeech?.speak('Help gesture detected. Sending emergency alert.');
    }

    const alertResult = await sendBackendEmergencyAlert(source, loc);

    if (alertResult.success) {
      updateStatus('success', alertResult.message || 'Emergency alert sent successfully.');
      window.EchoHand?.showToast?.('🚨 Emergency alert dispatched!', 'mint', 4000);
      if (source === 'gesture') {
        window.EchoHandSpeech?.speak('Emergency alert delivered.');
      }
    } else {
      updateStatus('error', alertResult.message || 'Unable to send emergency alert.');
      window.EchoHand?.showToast?.(alertResult.message, 'crimson', 5000);
    }

    renderContacts();
  }

  function onHelpGesture() {
    if (alertTriggered) return;
    alertTriggered = true;
    triggerEmergency('gesture');
    setTimeout(() => { alertTriggered = false; }, 30000);
  }

  async function handleContactInviteParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    if (!inviteToken) return;

    try {
      if (!window.EchoHandFCM) return;
      const verifyRes = await window.EchoHandFCM.verifyInviteToken(inviteToken);
      if (!verifyRes.success) return;

      openEmergencyHelpModal();
      updateStatus('info', 'Enable notifications on this device using the button below.');
    } catch (err) {
      console.warn('[EchoHand Emergency] Invalid invite parameter:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('openEmergencyHelpBtn')?.addEventListener('click', () => openEmergencyHelpModal());

    $('emergencyPanicBtn')?.addEventListener('click', () => triggerEmergency('manual'));

    $('emergencySendAlertBtn')?.addEventListener('click', () => triggerEmergency('manual'));

    $('emergencyGetLocationBtn')?.addEventListener('click', async () => {
      const locText = $('emergencyLocationText');
      const locBox = $('emergencyLocationBox');
      if (locBox) locBox.hidden = false;
      if (locText) locText.textContent = '📍 Acquiring current location…';
      try {
        const loc = await fetchLocation();
        updateLocationBox(loc);
      } catch (_) {
        if (locText) locText.textContent = '📍 Could not get location.';
      }
    });

    const modal = $('emergencyModal');
    if (modal) {
      new MutationObserver(() => {
        if (modal.classList.contains('is-open')) {
          renderContacts();
        }
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    setTimeout(handleContactInviteParam, 500);
  });

  window.EchoHandEmergency = {
    onHelpGesture,
    triggerEmergency,
    openEmergencyHelpModal,
    fetchLocation,
    sendBackendEmergencyAlert
  };

})();
