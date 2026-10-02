/**
 * ECHOHAND - Landing Page Interactive Logic
 * Calm, Minimal, Accessible Presentation
 */

document.addEventListener('DOMContentLoaded', () => {
  initHeroSpeech();
  initEmergencyFlow();
});

/**
 * Hero Sample Speech Trigger
 */
function initHeroSpeech() {
  const listenBtn = document.getElementById('heroListenBtn');
  if (!listenBtn) return;

  listenBtn.addEventListener('click', () => {
    listenBtn.style.opacity = '0.7';
    EchoHand.speakText('Hello! Welcome to EchoHand.', null, () => {
      listenBtn.style.opacity = '1';
    });
    EchoHand.showToast('Speaking gesture: "Hello"', 'mint', 1800);
  });
}

/**
 * Calm Emergency Assistance Flow Preview
 */
function initEmergencyFlow() {
  const openModalBtn = document.getElementById('calmEmergencyDemoBtn');
  const modalOverlay = document.getElementById('emergencyModalOverlay');
  const cancelBtn = document.getElementById('emergencyCancelBtn');
  const dispatchBtn = document.getElementById('emergencyDispatchBtn');
  const coordsDisplay = document.getElementById('modalCoordsDisplay');

  if (openModalBtn && modalOverlay) {
    openModalBtn.addEventListener('click', async () => {
      modalOverlay.classList.add('active');
      if (coordsDisplay) {
        coordsDisplay.textContent = '📍 Locating approximate coordinates...';
      }

      const loc = await EchoHand.getCurrentLocation();
      const mapsUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;

      if (coordsDisplay) {
        coordsDisplay.innerHTML = `📍 Approximate Location: <strong>${loc.lat}, ${loc.lng}</strong><br><a href="${mapsUrl}" target="_blank" rel="noreferrer" style="color: var(--c-forest-border); font-size: 0.85rem; text-decoration: underline; margin-top: 4px; display: inline-block;">Open in Google Maps</a>`;
      }
    });
  }

  if (cancelBtn && modalOverlay) {
    cancelBtn.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
    });
  }

  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.classList.remove('active');
      }
    });
  }

  if (dispatchBtn && modalOverlay) {
    dispatchBtn.addEventListener('click', () => {
      EchoHand.showToast('Simulating alert dispatch to emergency contacts.', 'mint', 2500);
      modalOverlay.classList.remove('active');
    });
  }
}
