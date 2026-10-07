/**
 * ECHOHAND - Emergency System
 * Handles HELP gesture detection, manual panic button, geolocation acquisition,
 * and dispatching Firebase Cloud Messaging (FCM) emergency alerts.
 */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  let currentLocation = null;
  let alertTriggered = false; // Debounce flag to prevent duplicate alerts

  const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:')
    ? 'http://127.0.0.1:5000'
    : '';


  // ── Get location (returns a Promise) ────────────────────
  function fetchLocation() {
    return new Promise((resolve, reject) => {
      if (currentLocation) { resolve(currentLocation); return; }
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
    if (!loc) return 'Location unavailable';
    return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  }

  // ── Update status box in modal ──────────────────────────
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

  // ── Update location display in modal ────────────────────
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

  // ── Send Alert via Backend Flask & Firebase Admin SDK ────
  async function sendBackendEmergencyAlert(source, loc) {
    const token = localStorage.getItem('echohand_token');

    if (!token) {
      return {
        success: false,
        message: 'You are in guest mode. Please sign in to send automatic FCM alerts to your registered emergency contacts.'
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

  // ── Render contacts with FCM Status & Controls ───────────
  function renderContacts(loc) {
    const list = $('emergencyContactsList');
    if (!list) return;

    let contacts = [];
    try { contacts = JSON.parse(localStorage.getItem('echohand_contacts')) || []; } catch (_) {}

    const userName = (() => {
      try { return JSON.parse(localStorage.getItem('echohand_user'))?.name || 'EchoHand user'; } catch (_) { return 'EchoHand user'; }
    })();

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
        ? `<span class="contact-fcm-pill is-active" title="${tokens.length} device(s) registered">🔔 Notifications Active (${tokens.length})</span>`
        : `<span class="contact-fcm-pill is-inactive" title="No device registered yet">⚠️ Notifications Pending</span>`;

      // Secondary WhatsApp fallback link for backup communication
      const msg = `🚨 EchoHand Emergency Alert\n\nHELP triggered by ${userName}!\n📍 Location: ${mapsLink(loc)}`;
      const waUrl = `https://wa.me/${c.phone ? c.phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(msg)}`;

      return `
        <div class="emergency-contact-card" data-contact-id="${c.id}">
          <div class="emergency-contact-main">
            <div class="emergency-contact-avatar">${(c.name || 'C').charAt(0).toUpperCase()}</div>
            <div class="emergency-contact-info">
              <div class="emergency-contact-title-row">
                <span class="emergency-contact-name">${c.name}</span>
                ${c.isPrimary || c.is_primary ? '<span class="primary-tag">Primary</span>' : ''}
              </div>
              <span class="emergency-contact-meta">${c.phone || 'No phone'} ${c.relation ? '· ' + c.relation : ''}</span>
              <div class="emergency-contact-status-row">${deviceLabel}</div>
            </div>
          </div>
          <div class="emergency-contact-actions">
            <button type="button" class="btn btn-outline btn-xs btn-enable-device" data-contact-id="${c.id}" title="Register this browser for ${c.name}">
              📱 Enable on This Device
            </button>
            <button type="button" class="btn btn-outline btn-xs btn-copy-invite" data-contact-id="${c.id}" title="Copy link for ${c.name} to enable alerts on their phone">
              🔗 Share Invite Link
            </button>
            <a class="emergency-backup-wa" href="${waUrl}" target="_blank" rel="noopener noreferrer" title="Send WhatsApp backup message">
              WhatsApp Backup
            </a>
          </div>
        </div>
      `;
    }).join('');

    // Wire actions
    list.querySelectorAll('.btn-enable-device').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cId = parseInt(btn.dataset.contactId, 10);
        btn.disabled = true;
        btn.textContent = 'Enabling…';
        try {
          if (!window.EchoHandFCM) throw new Error('Firebase messaging not initialized.');
          const res = await window.EchoHandFCM.registerWithBackend({ contactId: cId });
          window.EchoHand?.showToast?.(res.message || 'Device registered successfully!', 'mint', 3500);
          btn.textContent = '✅ Enabled';
          // Update cached contacts in localStorage
          refreshUserProfileContacts();
        } catch (err) {
          window.EchoHand?.showToast?.(err.message || 'Failed to enable notifications.', 'crimson', 4000);
          btn.disabled = false;
          btn.textContent = '📱 Enable on This Device';
        }
      });
    });

    list.querySelectorAll('.btn-copy-invite').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cId = parseInt(btn.dataset.contactId, 10);
        btn.disabled = true;
        btn.textContent = 'Creating link…';
        try {
          if (!window.EchoHandFCM) throw new Error('Firebase messaging module unavailable.');
          const info = await window.EchoHandFCM.generateInviteLink(cId);
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(info.inviteUrl);
            window.EchoHand?.showToast?.('Registration link copied! Send it to your contact via WhatsApp/SMS.', 'mint', 4000);
          } else {
            prompt('Copy this registration link and send it to your contact:', info.inviteUrl);
          }
          btn.textContent = '✅ Copied!';
          setTimeout(() => { btn.disabled = false; btn.textContent = '🔗 Share Invite Link'; }, 3000);
        } catch (err) {
          window.EchoHand?.showToast?.(err.message || 'Could not generate invite link.', 'crimson', 3500);
          btn.disabled = false;
          btn.textContent = '🔗 Share Invite Link';
        }
      });
    });
  }

  // Helper to re-fetch contacts from server and update localStorage
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
          renderContacts(currentLocation);
        }
      }
    } catch (_) {}
  }

  // ── Core trigger — called by HELP gesture OR manual panic button ──
  async function triggerEmergency(source) {
    // 1. Open the modal
    window.EchoHandDashboard?.openModal('emergencyModal');

    // 2. Show pulsing alert badge
    const badge = $('emergencyHelpBadge');
    if (badge) badge.classList.add('is-alerting');

    // 3. Update status: Getting location
    updateStatus('loading', 'Getting your location…');

    const locText = $('emergencyLocationText');
    const locBox  = $('emergencyLocationBox');
    if (locBox)  locBox.hidden = false;
    if (locText) locText.textContent = '📍 Acquiring GPS coordinates…';

    let loc = null;
    try {
      loc = await fetchLocation();
      updateLocationBox(loc);
    } catch (err) {
      if (locText) locText.textContent = '📍 Location unavailable — alert will be sent without coordinates.';
    }

    // 4. Update status: Sending alert
    updateStatus('loading', 'Sending emergency alert via Firebase Cloud Messaging…');

    if (source === 'gesture') {
      window.EchoHandSpeech?.speak('Help gesture detected. Sending emergency alert.');
    }

    // 5. Send FCM alert via backend
    const alertResult = await sendBackendEmergencyAlert(source, loc);

    // 6. Update UI with result
    if (alertResult.success) {
      updateStatus('success', `Emergency alert sent successfully to registered contacts.`);
      if (window.EchoHand?.showToast) {
        window.EchoHand.showToast('🚨 Emergency alert dispatched to your contacts!', 'mint', 4000);
      }
      if (source === 'gesture') {
        window.EchoHandSpeech?.speak('Emergency alert delivered.');
      }
    } else {
      updateStatus('error', `Unable to send emergency alert: ${alertResult.message}`);
      if (window.EchoHand?.showToast) {
        window.EchoHand.showToast(alertResult.message, 'crimson', 5000);
      }
    }

    // Render contacts
    renderContacts(loc);
  }

  // ── Public: called by camera.js and glove.js on HELP ────
  function onHelpGesture() {
    if (alertTriggered) return;
    alertTriggered = true;
    triggerEmergency('gesture');
    // Re-arm after 30s to prevent duplicate alerts
    setTimeout(() => { alertTriggered = false; }, 30000);
  }

  // ── Handle Invite Link Onboarding (for contacts opening ?invite=...) ──
  async function handleContactInviteParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('invite');
    if (!inviteToken) return;

    try {
      if (!window.EchoHandFCM) return;
      const verifyRes = await window.EchoHandFCM.verifyInviteToken(inviteToken);
      if (!verifyRes.success) return;

      const userName = verifyRes.user_name || 'an EchoHand user';
      const contactName = verifyRes.contact_name || 'Emergency Contact';

      // Open emergency modal with specialized contact registration prompt
      window.EchoHandDashboard?.openModal('emergencyModal');
      updateStatus('loading', `Welcome, ${contactName}! Please enable notifications to receive emergency alerts for ${userName}.`);

      const list = $('emergencyContactsList');
      if (list) {
        list.innerHTML = `
          <div class="emergency-invite-prompt">
            <div class="invite-banner-icon">🔔</div>
            <h3>Emergency Alert Device Registration</h3>
            <p>You are registered as a trusted emergency contact for <strong>${userName}</strong>.</p>
            <p>Enable browser notifications on this device to receive immediate alerts if ${userName} triggers a HELP gesture or emergency alarm.</p>
            <button type="button" class="btn btn-primary" id="btnAcceptInviteNotifications" style="margin-top:1rem;width:100%;">
              Enable Emergency Notifications on This Device
            </button>
          </div>
        `;

        $('btnAcceptInviteNotifications')?.addEventListener('click', async () => {
          const btn = $('btnAcceptInviteNotifications');
          btn.disabled = true;
          btn.textContent = 'Enabling Notifications…';
          try {
            const regRes = await window.EchoHandFCM.registerWithBackend({ inviteToken });
            updateStatus('success', `Emergency notifications successfully enabled for ${contactName}!`);
            list.innerHTML = `
              <div class="emergency-invite-success">
                <p>✅ <strong>Device successfully registered!</strong></p>
                <p>You will now automatically receive high-priority emergency notifications with live GPS location whenever ${userName} requests assistance.</p>
              </div>
            `;
            window.EchoHand?.showToast?.('Emergency notifications enabled on this device!', 'mint', 5000);
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Enable Emergency Notifications on This Device';
            updateStatus('error', err.message || 'Failed to enable notifications. Please allow browser notifications and try again.');
          }
        });
      }
    } catch (err) {
      console.warn('[EchoHand Emergency] Invalid invite parameter:', err);
    }
  }

  // ── Wire buttons and init ────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Manual emergency button (big red button on dashboard)
    $('emergencyPanicBtn')?.addEventListener('click', () => triggerEmergency('manual'));

    // "Get My Location" button inside modal
    $('emergencyGetLocationBtn')?.addEventListener('click', async () => {
      const locText = $('emergencyLocationText');
      const locBox  = $('emergencyLocationBox');
      if (locBox)  locBox.hidden = false;
      if (locText) locText.textContent = '📍 Acquiring current location…';
      try {
        const loc = await fetchLocation();
        updateLocationBox(loc);
        renderContacts(loc);
      } catch (_) {
        if (locText) locText.textContent = '📍 Could not get location. Allow location access and retry.';
      }
    });

    // Re-render contacts and fetch fresh profile when modal opens
    const modal = $('emergencyModal');
    if (modal) {
      new MutationObserver(() => {
        if (modal.classList.contains('is-open')) {
          renderContacts(currentLocation);
          refreshUserProfileContacts();
        }
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    // "Enable Emergency Notifications" button inside modal footer
    $('emergencyEnableNotifsBtn')?.addEventListener('click', async () => {
      const btn = $('emergencyEnableNotifsBtn');
      btn.disabled = true;
      btn.textContent = 'Enabling…';
      try {
        if (!window.EchoHandFCM) throw new Error('Firebase messaging module unavailable.');
        const res = await window.EchoHandFCM.registerWithBackend();
        window.EchoHand?.showToast?.(res.message || 'Notifications enabled for this device!', 'mint', 4000);
        btn.textContent = '✅ Notifications Active';
        updateStatus('success', 'Emergency notifications successfully enabled on this device.');
        refreshUserProfileContacts();
      } catch (err) {
        window.EchoHand?.showToast?.(err.message || 'Failed to enable notifications.', 'crimson', 4500);
        btn.disabled = false;
        btn.textContent = '🔔 Enable Emergency Notifications';
        updateStatus('error', err.message || 'Could not enable notifications.');
      }
    });

    // Check for invite parameter in URL
    setTimeout(handleContactInviteParam, 500);
  });

  window.EchoHandEmergency = {
    onHelpGesture,
    triggerEmergency,
    fetchLocation,
    sendBackendEmergencyAlert
  };

})();
