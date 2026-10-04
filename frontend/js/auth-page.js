/**
 * ECHOHAND - Combined Login / Sign-Up Page Logic
 * Handles: tab switching, multi-contact management, validation, localStorage
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabSwitcher();
  initLoginForm();
  initSignupForm();
  initPasswordToggles();
  initHashRouting();
});

/* ── Tab Switcher ─────────────────────────────────────────────────────────── */
function initTabSwitcher() {
  const loginTab   = document.getElementById('loginTab');
  const signupTab  = document.getElementById('signupTab');
  const loginPanel = document.getElementById('loginPanel');
  const signupPanel = document.getElementById('signupPanel');
  const switcher   = document.querySelector('.auth-switcher');

  if (!loginTab || !signupTab) return;

  function activateTab(tab, updateHash = true) {
    const isLogin = tab === 'login';

    loginTab.classList.toggle('is-active', isLogin);
    signupTab.classList.toggle('is-active', !isLogin);
    loginTab.setAttribute('aria-selected', isLogin ? 'true' : 'false');
    signupTab.setAttribute('aria-selected', !isLogin ? 'true' : 'false');

    if (loginPanel) {
      loginPanel.hidden = !isLogin;
      if (isLogin) {
        loginPanel.removeAttribute('hidden');
      } else {
        loginPanel.setAttribute('hidden', '');
      }
    }
    if (signupPanel) {
      signupPanel.hidden = isLogin;
      if (!isLogin) {
        signupPanel.removeAttribute('hidden');
      } else {
        signupPanel.setAttribute('hidden', '');
      }
    }

    if (switcher) switcher.setAttribute('data-active', isLogin ? 'login' : 'signup');

    if (updateHash) {
      const targetHash = isLogin ? '#login' : '#signup';
      if (window.location.hash !== targetHash) {
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', targetHash);
        } else {
          window.location.hash = targetHash;
        }
      }
    }
  }

  // 1. Tab switches
  loginTab.addEventListener('click',  () => activateTab('login'));
  signupTab.addEventListener('click', () => activateTab('signup'));

  // 2. Text-link switches inside panels (e.g. bottom "Create an account" & "Log in")
  document.querySelectorAll('.text-switch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      activateTab(btn.dataset.switch);
    });
  });

  // 3. Top navigation button and any anchor links pointing to #signup or #login
  document.querySelectorAll('a[href*="#signup"], a[href$="#signup"], #navCreateAccountBtn').forEach(link => {
    link.addEventListener('click', (e) => {
      // If staying on this page
      e.preventDefault();
      activateTab('signup');
    });
  });

  document.querySelectorAll('a[href*="#login"], a[href$="#login"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activateTab('login');
    });
  });

  // Expose on window for direct access if needed
  window.EchoHandAuthTabs = { activateTab };
}

/* ── Hash routing: login.html#signup opens signup tab directly ────────────── */
function initHashRouting() {
  function handleHash() {
    const hash = window.location.hash;
    if (hash === '#signup') {
      const signupTab = document.getElementById('signupTab');
      if (signupTab) signupTab.click();
    } else if (hash === '#login') {
      const loginTab = document.getElementById('loginTab');
      if (loginTab) loginTab.click();
    }
  }

  // Check on initial load
  handleHash();

  // Listen to hash change events (e.g. browser back/forward or external anchor clicks)
  window.addEventListener('hashchange', handleHash);
}

/* ── Password Toggles ─────────────────────────────────────────────────────── */
function initPasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach(btn => {
    const targetId = btn.dataset.passwordToggle;
    const input = document.getElementById(targetId);
    if (!input) return;

    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.style.color = show ? '#051F20' : 'rgba(5,31,32,0.45)';
    });
  });
}

/* ── Backend API Configuration ────────────────────────────────────────────── */
const API_BASE = (window.location.protocol === 'file:' || (window.location.port && !window.location.port.includes('5000')))
  ? 'http://127.0.0.1:5000'
  : '';

/* ── Login Form ───────────────────────────────────────────────────────────── */
function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors(form);

    const email    = form.querySelector('#loginEmail');
    const password = form.querySelector('#loginPassword');
    let valid = true;

    if (!email.value.trim() || !isValidEmail(email.value.trim())) {
      showFieldError(email, 'Please enter a valid email address.');
      valid = false;
    }
    if (!password.value) {
      showFieldError(password, 'Please enter your password.');
      valid = false;
    }
    if (!valid) return;

    const btn = document.getElementById('loginSubmitBtn');
    const originalBtnText = btn ? btn.textContent : 'Log in to EchoHand';
    if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value.trim(),
          password: password.value
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        const user = data.user || {};
        const userName = user.name || 'there';

        if (data.token) {
          localStorage.setItem('echohand_token', data.token);
        }
        localStorage.setItem('echohand_user', JSON.stringify(user));
        localStorage.setItem('echoHandUser', JSON.stringify(user));
        localStorage.setItem('echohand_logged_in', 'true');
        localStorage.setItem('echoHandLoggedIn', 'true');
        if (user.emergencyContacts) {
          localStorage.setItem('echohand_contacts', JSON.stringify(user.emergencyContacts));
        }

        EchoHand.showToast(data.message || `Welcome back, ${userName}! Loading your workspace…`, 'mint', 2500);
        setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
      } else {
        if (btn) { btn.textContent = originalBtnText; btn.disabled = false; }
        const errMsg = data.message || 'Invalid email or password.';
        showFieldError(password, errMsg);
        EchoHand.showToast(errMsg, 'crimson', 3500);
      }
    } catch (err) {
      console.warn('API connection failed, falling back to local session:', err);
      // Fallback for offline local dev mode if server is not reachable
      let storedUser = null;
      try { storedUser = JSON.parse(localStorage.getItem('echohand_user')); } catch (_) {}
      const userName = storedUser?.name || 'there';

      localStorage.setItem('echohand_logged_in', 'true');
      localStorage.setItem('echoHandLoggedIn', 'true');
      if (!storedUser) ensureDefaultUserData();

      EchoHand.showToast(`Connected locally (offline mode). Welcome back, ${userName}!`, 'mint', 2500);
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
    }
  });
}

/* ── Multi-Contact Manager ────────────────────────────────────────────────── */
const MAX_CONTACTS = 3;
let extraContactCount = 0;

function initSignupForm() {
  const form = document.getElementById('signupForm');
  if (!form) return;

  // "Add Emergency Contact" button
  const addBtn = document.getElementById('addContactBtn');
  if (addBtn) {
    addBtn.addEventListener('click', addExtraContact);
  }

  form.addEventListener('submit', handleSignupSubmit);
}

function addExtraContact() {
  if (extraContactCount >= MAX_CONTACTS - 1) return; // slot 1 is always visible
  extraContactCount++;

  const contactNum = extraContactCount + 1; // display label: Contact 2, 3…
  const id = `extra-contact-${extraContactCount}`;

  const item = document.createElement('div');
  item.className = 'extra-contact-item';
  item.id = id;
  item.innerHTML = `
    <div class="extra-contact-header">
      <span class="extra-contact-label">Contact ${contactNum}</span>
      <button type="button" class="remove-contact-btn" data-remove="${id}">Remove</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Contact name</label>
        <input type="text" class="form-input extra-contact-name" placeholder="Name" autocomplete="off">
        <span class="field-error"></span>
      </div>
      <div class="form-group">
        <label class="form-label">Phone number</label>
        <input type="tel" class="form-input extra-contact-phone" placeholder="+1 555 0100" inputmode="tel">
        <span class="field-error"></span>
      </div>
    </div>
  `;

  // Insert before the add button
  const addBtn = document.getElementById('addContactBtn');
  addBtn.parentNode.insertBefore(item, addBtn);

  item.querySelector('.remove-contact-btn').addEventListener('click', () => {
    item.remove();
    extraContactCount--;
    updateAddBtnState();
    renumberExtraContacts();
  });

  updateAddBtnState();
}

function updateAddBtnState() {
  const addBtn = document.getElementById('addContactBtn');
  if (!addBtn) return;
  const atMax = extraContactCount >= MAX_CONTACTS - 1;
  addBtn.disabled = atMax;
  addBtn.title = atMax ? `Maximum ${MAX_CONTACTS} contacts allowed` : '';
}

function renumberExtraContacts() {
  document.querySelectorAll('.extra-contact-item').forEach((item, i) => {
    const label = item.querySelector('.extra-contact-label');
    if (label) label.textContent = `Contact ${i + 2}`;
  });
}

/* ── Signup Submit ────────────────────────────────────────────────────────── */
async function handleSignupSubmit(e) {
  e.preventDefault();
  const form = e.target;
  clearErrors(form);

  const fullName        = form.querySelector('#signupFullName');
  const email           = form.querySelector('#signupEmail');
  const password        = form.querySelector('#signupPassword');
  const confirmPassword = form.querySelector('#signupConfirmPassword');
  const emergencyName   = form.querySelector('#emergencyName');
  const emergencyPhone  = form.querySelector('#emergencyPhone');

  let valid = true;

  if (!fullName.value.trim()) {
    showFieldError(fullName, 'Full name is required.');
    valid = false;
  }

  if (!email.value.trim() || !isValidEmail(email.value.trim())) {
    showFieldError(email, 'Please enter a valid email address.');
    valid = false;
  }

  if (!password.value || password.value.length < 8) {
    showFieldError(password, 'Password must be at least 8 characters.');
    valid = false;
  }

  if (password.value !== confirmPassword.value) {
    showFieldError(confirmPassword, 'Passwords do not match.');
    valid = false;
  }

  if (!emergencyName.value.trim()) {
    showFieldError(emergencyName, 'Emergency contact name is required.');
    valid = false;
  }

  if (!emergencyPhone.value.trim() || !isValidPhone(emergencyPhone.value.trim())) {
    showFieldError(emergencyPhone, 'Please enter a valid phone number.');
    valid = false;
  }

  // Validate extra contacts (if added, both fields must be filled)
  document.querySelectorAll('.extra-contact-item').forEach(item => {
    const nameInput  = item.querySelector('.extra-contact-name');
    const phoneInput = item.querySelector('.extra-contact-phone');
    if (!nameInput.value.trim()) {
      showFieldError(nameInput, 'Contact name is required.');
      valid = false;
    }
    if (!phoneInput.value.trim() || !isValidPhone(phoneInput.value.trim())) {
      showFieldError(phoneInput, 'Please enter a valid phone number.');
      valid = false;
    }
  });

  if (!valid) return;

  // Read user phone (from #signupPhone)
  const phoneInput = form.querySelector('#signupPhone');
  const userPhone = phoneInput ? phoneInput.value.trim() : '';

  // Build contacts array
  const emergencyContacts = [
    {
      id: 1,
      name: emergencyName.value.trim(),
      phone: emergencyPhone.value.trim(),
      relation: form.querySelector('#emergencyRelation')?.value || 'Parent / Family',
      isPrimary: true
    }
  ];

  document.querySelectorAll('.extra-contact-item').forEach((item, i) => {
    emergencyContacts.push({
      id: i + 2,
      name: item.querySelector('.extra-contact-name').value.trim(),
      phone: item.querySelector('.extra-contact-phone').value.trim(),
      relation: 'Other',
      isPrimary: false
    });
  });

  const btn = document.getElementById('signupSubmitBtn');
  const originalBtnText = btn ? btn.textContent : 'Create my account';
  if (btn) { btn.textContent = 'Creating account…'; btn.disabled = true; }

  const signupPayload = {
    fullName: fullName.value.trim(),
    email: email.value.trim(),
    phone: userPhone,
    password: password.value,
    confirmPassword: confirmPassword.value,
    emergencyContacts: emergencyContacts
  };

  try {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupPayload)
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success) {
      const user = data.user || {};
      if (data.token) {
        localStorage.setItem('echohand_token', data.token);
      }
      localStorage.setItem('echohand_user', JSON.stringify(user));
      localStorage.setItem('echoHandUser', JSON.stringify(user));
      localStorage.setItem('echohand_contacts', JSON.stringify(user.emergencyContacts || emergencyContacts));
      localStorage.setItem('echohand_logged_in', 'true');
      localStorage.setItem('echoHandLoggedIn', 'true');

      if (btn) { btn.textContent = 'Account created! Loading…'; }
      EchoHand.showToast(data.message || `Welcome to EchoHand, ${user.name}! Setting up your workspace…`, 'mint', 2500);
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
    } else {
      if (btn) { btn.textContent = originalBtnText; btn.disabled = false; }
      if (data.errors) {
        if (data.errors.email) showFieldError(email, data.errors.email);
        if (data.errors.password) showFieldError(password, data.errors.password);
        if (data.errors.confirmPassword) showFieldError(confirmPassword, data.errors.confirmPassword);
        if (data.errors.fullName) showFieldError(fullName, data.errors.fullName);
      }
      const errMsg = data.message || 'Registration failed. Please check form inputs.';
      EchoHand.showToast(errMsg, 'crimson', 3500);
    }
  } catch (err) {
    console.warn('API registration failed, storing profile locally (offline mode):', err);
    // Offline local fallback
    const userProfile = {
      name: fullName.value.trim(),
      email: email.value.trim(),
      phone: userPhone,
      registeredAt: new Date().toISOString()
    };

    try {
      localStorage.setItem('echohand_user', JSON.stringify(userProfile));
      localStorage.setItem('echoHandUser', JSON.stringify(userProfile));
      localStorage.setItem('echohand_contacts', JSON.stringify(emergencyContacts));
      localStorage.setItem('echohand_logged_in', 'true');
      localStorage.setItem('echoHandLoggedIn', 'true');
    } catch (_) {}

    if (btn) { btn.textContent = 'Account created! Loading…'; }
    EchoHand.showToast(`Account saved locally (offline mode). Welcome, ${userProfile.name}!`, 'mint', 2500);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
  }
}

/* ── Validation helpers ───────────────────────────────────────────────────── */
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidPhone(v) {
  // Accepts formats like +91 9876543210, +1 555-0100, 07911123456, etc.
  return /^[+\d][\d\s\-().]{6,19}$/.test(v);
}

function showFieldError(input, message) {
  input.classList.add('has-error');
  let err = input.nextElementSibling;
  if (!err || !err.classList.contains('field-error')) {
    err = document.createElement('span');
    err.className = 'field-error';
    input.parentNode.insertBefore(err, input.nextSibling);
  }
  err.textContent = message;
  err.classList.add('visible');
}

function clearErrors(container) {
  container.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
  container.querySelectorAll('.field-error.visible').forEach(el => {
    el.classList.remove('visible');
    el.textContent = '';
  });
}

/* ── Default user data fallback ───────────────────────────────────────────── */
function ensureDefaultUserData() {
  if (!localStorage.getItem('echohand_user')) {
    localStorage.setItem('echohand_user', JSON.stringify({
      name: 'Guest',
      email: 'guest@echohand.org',
      preferredInput: 'both',
      registeredAt: new Date().toISOString()
    }));
  }
  if (!localStorage.getItem('echohand_contacts')) {
    localStorage.setItem('echohand_contacts', JSON.stringify([
      { id: 1, name: 'Emergency Contact', phone: '+1 555 0100', relation: 'Family Member', isPrimary: true }
    ]));
  }
}
