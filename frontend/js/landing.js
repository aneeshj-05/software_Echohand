/**
 * ECHOHAND - Landing Page Interactive Logic
 * Calm, Minimal, Accessible Presentation
 */

document.addEventListener('DOMContentLoaded', () => {
  initHeroSpeech();
  initGestureTabs();
  initEmergencyFlow();
});

/**
 * Gesture tab switcher on hero card
 */
function initGestureTabs() {
  const tabs    = document.querySelectorAll('.gesture-tab');
  const wordEl  = document.getElementById('heroGestureWord');
  const confEl  = document.getElementById('heroGestureConf');
  const toggle  = document.getElementById('cardViewToggle');
  const viewG   = document.getElementById('viewGesture');
  const viewS   = document.getElementById('viewSensor');
  if (!tabs.length || !wordEl || !confEl) return;

  const FINGER_DATA = {
    YES:   [90, 85, 82, 18, 12],
    NO:    [75, 92, 88, 15, 10],
    DRINK: [88, 20, 18, 15, 82],
    DEAF:  [30, 91, 15, 12, 10],
    NOW:   [85, 80, 78, 75, 88],
  };

  const bars = ['Thumb','Index','Middle','Ring','Little'].map(f => ({
    bar: document.getElementById('fbar' + f),
    val: document.getElementById('fval' + f),
  }));

  function updateChart(word) {
    const vals = FINGER_DATA[word] || [50,50,50,50,50];
    bars.forEach(({ bar, val }, i) => {
      if (!bar || !val) return;
      bar.style.width = vals[i] + '%';
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = '';
      val.textContent = vals[i] + '%';
    });
  }

  // Toggle between gesture view and sensor view
  let showingSensor = false;
  if (toggle && viewG && viewS) {
    toggle.addEventListener('click', () => {
      showingSensor = !showingSensor;
      viewG.classList.toggle('is-active', !showingSensor);
      viewS.classList.toggle('is-active', showingSensor);
      toggle.textContent = showingSensor ? 'Gesture' : 'Sensor Data';
      toggle.classList.toggle('is-sensor', showingSensor);
      if (showingSensor) updateChart(wordEl.textContent);
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      wordEl.textContent = tab.dataset.word;
      confEl.textContent = tab.dataset.conf + '% confidence';
      if (showingSensor) updateChart(tab.dataset.word);
    });
  });
}

/**
 * Hero Sample Speech Trigger
 */
function initHeroSpeech() {
  const listenBtn = document.getElementById('heroListenBtn');
  if (!listenBtn) return;

  listenBtn.addEventListener('click', () => {
    const word = document.getElementById('heroGestureWord')?.textContent || 'YES';
    listenBtn.style.opacity = '0.7';
    EchoHand.speakText(word, null, () => { listenBtn.style.opacity = '1'; });
    EchoHand.showToast(`Speaking: "${word}"`, 'mint', 1800);
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
