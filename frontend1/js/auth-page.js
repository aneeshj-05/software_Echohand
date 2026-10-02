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

  function activateTab(tab) {
    const isLogin = tab === 'login';

    loginTab.classList.toggle('is-active', isLogin);
    signupTab.classList.toggle('is-active', !isLogin);
    loginTab.setAttribute('aria-selected', isLogin);
    signupTab.setAttribute('aria-selected', !isLogin);

    if (loginPanel)  loginPanel.hidden  = !isLogin;
    if (signupPanel) signupPanel.hidden = isLogin;

    if (switcher) switcher.setAttribute('data-active', isLogin ? 'login' : 'signup');
  }

  loginTab.addEventListener('click',  () => activateTab('login'));
  signupTab.addEventListener('click', () => activateTab('signup'));

  // Text-link switches inside panels
  document.querySelectorAll('.text-switch').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.switch));
  });
}

/* ── Hash routing: login.html#signup opens signup tab directly ────────────── */
function initHashRouting() {
  if (window.location.hash === '#signup') {
    const signupTab = document.getElementById('signupTab');
    if (signupTab) signupTab.click();
  }
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

/* ── Login Form ───────────────────────────────────────────────────────────── */
function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', e => {
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

    // Check stored user
    let storedUser = null;
    try { storedUser = JSON.parse(localStorage.getItem('echohand_user')); } catch (_) {}
    const userName = storedUser?.name || 'there';

    localStorage.setItem('echohand_logged_in', 'true');
    if (!storedUser) ensureDefaultUserData();

    const btn = document.getElementById('loginSubmitBtn');
    if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }

    EchoHand.showToast(`Welcome back, ${userName}! Loading your workspace…`, 'mint', 2500);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
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
function handleSignupSubmit(e) {
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

  // Build contacts array
  const emergencyContacts = [
    {
      id: 1,
      name: emergencyName.value.trim(),
      phone: emergencyPhone.value.trim(),
      relation: form.querySelector('#emergencyRelation')?.value || 'Family Member',
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

  const userProfile = {
    name: fullName.value.trim(),
    email: email.value.trim(),
    registeredAt: new Date().toISOString()
  };

  try {
    localStorage.setItem('echohand_user', JSON.stringify(userProfile));
    localStorage.setItem('echohand_contacts', JSON.stringify(emergencyContacts));
    localStorage.setItem('echohand_logged_in', 'true');
  } catch (_) {}

  const btn = document.getElementById('signupSubmitBtn');
  if (btn) { btn.textContent = 'Account created! Loading…'; btn.disabled = true; }

  EchoHand.showToast(`Welcome to EchoHand, ${userProfile.name}! Setting up your workspace…`, 'mint', 2500);
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
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
