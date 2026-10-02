/**
 * ECHOHAND - Authentication Logic (Login & Signup)
 * Handles client-side validation, password toggles, localStorage persistence,
 * emergency contacts storage, and redirection to dashboard.html.
 */

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggles();
  initLoginForm();
  initSignupForm();
  initDemoLogin();
  initForgotPassword();
});

/**
 * Toggle Password Visibility
 */
function initPasswordToggles() {
  const loginToggle = document.getElementById('togglePasswordBtn');
  const loginPassInput = document.getElementById('loginPassword');
  
  if (loginToggle && loginPassInput) {
    loginToggle.addEventListener('click', () => {
      const isPassword = loginPassInput.type === 'password';
      loginPassInput.type = isPassword ? 'text' : 'password';
      loginToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      loginToggle.style.color = isPassword ? 'var(--c-mint-light)' : 'rgba(218, 241, 222, 0.6)';
    });
  }

  const signupToggle = document.getElementById('toggleSignupPasswordBtn');
  const signupPassInput = document.getElementById('signupPassword');
  const signupConfirmPassInput = document.getElementById('signupConfirmPassword');

  if (signupToggle && signupPassInput) {
    signupToggle.addEventListener('click', () => {
      const isPassword = signupPassInput.type === 'password';
      signupPassInput.type = isPassword ? 'text' : 'password';
      if (signupConfirmPassInput) {
        signupConfirmPassInput.type = isPassword ? 'text' : 'password';
      }
      signupToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      signupToggle.style.color = isPassword ? 'var(--c-mint-light)' : 'rgba(218, 241, 222, 0.6)';
    });
  }
}

/**
 * Handle Login Form
 */
function initLoginForm() {
  const loginForm = document.getElementById('loginForm');
  if (!loginForm) return;

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value.trim();

    if (!email || !password) {
      EchoHand.showToast('Please enter both your email and password.', 'crimson', 3000);
      return;
    }

    // Check if user was registered in localStorage, else default to Amrutha
    let storedUser = null;
    try {
      storedUser = JSON.parse(localStorage.getItem('echohand_user'));
    } catch (err) {
      storedUser = null;
    }

    const userName = storedUser && storedUser.name ? storedUser.name : 'Amrutha';

    // Set active session in localStorage
    localStorage.setItem('echohand_logged_in', 'true');
    if (!storedUser) {
      ensureDefaultUserData();
    }

    const submitBtn = document.getElementById('loginSubmitBtn');
    if (submitBtn) {
      submitBtn.textContent = 'Signing in...';
      submitBtn.style.opacity = '0.7';
      submitBtn.disabled = true;
    }

    EchoHand.showToast(`Welcome back, ${userName}! Loading your workspace...`, 'mint', 2500);

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1200);
  });
}

/**
 * Quick Demo Login for Easy Testing
 */
function initDemoLogin() {
  const demoBtn = document.getElementById('demoLoginBtn');
  if (!demoBtn) return;

  demoBtn.addEventListener('click', () => {
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    if (emailInput) emailInput.value = 'amrutha@echohand.org';
    if (passwordInput) passwordInput.value = '••••••••';

    ensureDefaultUserData();
    localStorage.setItem('echohand_logged_in', 'true');

    EchoHand.showToast('Demo access granted for Amrutha. Opening workspace...', 'mint', 2200);

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);
  });
}

/**
 * Handle Signup Form with Emergency Contacts
 */
function initSignupForm() {
  const signupForm = document.getElementById('signupForm');
  if (!signupForm) return;

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const fullName = document.getElementById('signupFullName')?.value.trim();
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value;
    const confirmPassword = document.getElementById('signupConfirmPassword')?.value;
    const preferredInput = document.getElementById('signupPreferredInput')?.value || 'both';

    // Emergency Contact Fields
    const emergencyName = document.getElementById('emergencyName')?.value.trim();
    const emergencyPhone = document.getElementById('emergencyPhone')?.value.trim();
    const emergencyRelation = document.getElementById('emergencyRelation')?.value || 'Family Member';
    const emergencyConsent = document.getElementById('emergencyConsentCheckbox')?.checked;

    // Validation
    if (!fullName) {
      EchoHand.showToast('Please enter your full name.', 'crimson');
      return;
    }

    if (!email || !email.includes('@')) {
      EchoHand.showToast('Please enter a valid email address.', 'crimson');
      return;
    }

    if (!password || password.length < 6) {
      EchoHand.showToast('Password should be at least 6 characters long.', 'crimson');
      return;
    }

    if (password !== confirmPassword) {
      EchoHand.showToast('Passwords do not match. Please re-enter.', 'crimson');
      return;
    }

    if (!emergencyName || !emergencyPhone) {
      EchoHand.showToast('Please provide your primary emergency contact name and phone number.', 'crimson');
      return;
    }

    if (!emergencyConsent) {
      EchoHand.showToast('Please check the emergency GPS consent to proceed.', 'crimson');
      return;
    }

    // Save to localStorage
    const userProfile = {
      name: fullName,
      email: email,
      preferredInput: preferredInput,
      registeredAt: new Date().toISOString()
    };

    const emergencyContacts = [
      {
        id: 1,
        name: emergencyName,
        phone: emergencyPhone,
        relation: emergencyRelation,
        isPrimary: true
      }
    ];

    try {
      localStorage.setItem('echohand_user', JSON.stringify(userProfile));
      localStorage.setItem('echohand_contacts', JSON.stringify(emergencyContacts));
      localStorage.setItem('echohand_logged_in', 'true');
    } catch (err) {
      console.warn('Could not save to localStorage:', err);
    }

    const submitBtn = document.getElementById('signupSubmitBtn');
    if (submitBtn) {
      submitBtn.textContent = 'Account Created! Loading Workspace...';
      submitBtn.style.opacity = '0.85';
      submitBtn.disabled = true;
    }

    EchoHand.showToast(`Account successfully created for ${fullName}! Launching EchoHand...`, 'mint', 2500);

    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1200);
  });
}

/**
 * Forgot Password Handler
 */
function initForgotPassword() {
  const forgotBtn = document.getElementById('forgotPasswordBtn');
  if (!forgotBtn) return;

  forgotBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('loginEmail')?.value.trim();
    if (emailInput) {
      EchoHand.showToast(`Password reset instructions dispatched to ${emailInput}.`, 'mint', 3500);
    } else {
      EchoHand.showToast('Please type your email above first to receive reset instructions.', 'mint', 3000);
    }
  });
}

/**
 * Ensures Default Amrutha User Profile & Emergency Contact exists in localStorage
 */
function ensureDefaultUserData() {
  if (!localStorage.getItem('echohand_user')) {
    const defaultUser = {
      name: 'Amrutha',
      email: 'amrutha@echohand.org',
      preferredInput: 'both',
      registeredAt: new Date().toISOString()
    };
    localStorage.setItem('echohand_user', JSON.stringify(defaultUser));
  }

  if (!localStorage.getItem('echohand_contacts')) {
    const defaultContacts = [
      {
        id: 1,
        name: 'Priya (Mom)',
        phone: '+1 (555) 019-2834',
        relation: 'Parent / Family',
        isPrimary: true
      }
    ];
    localStorage.setItem('echohand_contacts', JSON.stringify(defaultContacts));
  }
}
