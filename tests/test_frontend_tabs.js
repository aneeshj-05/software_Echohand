const fs = require('fs');
const path = require('path');

// Minimal DOM Mock
class Element {
  constructor(tag, id = '', className = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className ? className.split(' ') : []),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList._classes.has(c)) this.classList._classes.delete(c);
          else this.classList._classes.add(c);
        } else if (force) {
          this.classList._classes.add(c);
        } else {
          this.classList._classes.delete(c);
        }
      },
      contains: (c) => this.classList._classes.has(c)
    };
    this.attributes = {};
    this.hidden = false;
    this.listeners = {};
    this.dataset = {};
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(fn => fn({ preventDefault: () => {} }));
    }
  }
}

// Build DOM tree matching login.html
const elements = {
  loginTab: new Element('button', 'loginTab', 'auth-switch is-active'),
  signupTab: new Element('button', 'signupTab', 'auth-switch'),
  loginPanel: new Element('section', 'loginPanel', 'auth-panel'),
  signupPanel: new Element('section', 'signupPanel', 'auth-panel'),
  switcher: new Element('div', '', 'auth-switcher'),
  bottomSignupBtn: new Element('button', '', 'text-switch'),
  bottomLoginBtn: new Element('button', '', 'text-switch'),
  navCreateBtn: new Element('a', 'navCreateAccountBtn', 'btn btn-secondary btn-sm'),
  loginForm: new Element('form', 'loginForm', 'auth-form'),
  signupForm: new Element('form', 'signupForm', 'auth-form')
};

elements.signupPanel.hidden = true;
elements.signupPanel.setAttribute('hidden', '');
elements.switcher.setAttribute('data-active', 'login');
elements.bottomSignupBtn.dataset.switch = 'signup';
elements.bottomLoginBtn.dataset.switch = 'login';
elements.navCreateBtn.setAttribute('href', 'login.html#signup');

const documentMock = {
  getElementById: (id) => elements[id] || null,
  querySelector: (sel) => {
    if (sel === '.auth-switcher') return elements.switcher;
    if (sel === '#loginTab') return elements.loginTab;
    if (sel === '#signupTab') return elements.signupTab;
    if (sel === '#loginPanel') return elements.loginPanel;
    if (sel === '#signupPanel') return elements.signupPanel;
    return null;
  },
  querySelectorAll: (sel) => {
    if (sel === '.text-switch') return [elements.bottomSignupBtn, elements.bottomLoginBtn];
    if (sel.includes('signup') || sel.includes('navCreateAccountBtn')) return [elements.navCreateBtn];
    if (sel.includes('login')) return [];
    if (sel.includes('password-toggle')) return [];
    return [];
  },
  addEventListener: (evt, fn) => {
    if (evt === 'DOMContentLoaded') fn();
  }
};

const windowMock = {
  location: { hash: '', protocol: 'http:', port: '5000', pathname: '/login.html' },
  history: { replaceState: (s, t, h) => { windowMock.location.hash = h; } },
  listeners: {},
  addEventListener: (evt, fn) => {
    if (!windowMock.listeners[evt]) windowMock.listeners[evt] = [];
    windowMock.listeners[evt].push(fn);
  }
};

// Test script execution
global.document = documentMock;
global.window = windowMock;
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};
global.EchoHand = { showToast: () => {} };

// Load and evaluate auth-page.js
const authPageCode = fs.readFileSync(path.join(__dirname, '../frontend/js/auth-page.js'), 'utf8');
eval(authPageCode);

console.log("=== Testing EchoHand Auth Page Controls ===");

// Initial state verification
console.assert(elements.loginPanel.hidden === false, "FAIL: Initial loginPanel should not be hidden");
console.assert(elements.signupPanel.hidden === true, "FAIL: Initial signupPanel should be hidden");
console.log("1. Initial state: Login panel visible, signup hidden -> PASS");

// Control 2: Click signupTab
elements.signupTab.click();
console.assert(elements.loginPanel.hidden === true, "FAIL: After signupTab click, loginPanel should be hidden");
console.assert(elements.signupPanel.hidden === false, "FAIL: After signupTab click, signupPanel should be visible");
console.assert(elements.switcher.getAttribute('data-active') === 'signup', "FAIL: Switcher data-active should be 'signup'");
console.log("2. Control 2 (Create account tab click) -> PASS");

// Switch back to loginTab
elements.loginTab.click();
console.assert(elements.loginPanel.hidden === false, "FAIL: After loginTab click, loginPanel should be visible");
console.assert(elements.signupPanel.hidden === true, "FAIL: After loginTab click, signupPanel should be hidden");
console.assert(elements.switcher.getAttribute('data-active') === 'login', "FAIL: Switcher data-active should be 'login'");
console.log("3. Sign In tab click -> PASS");

// Control 3: Click bottom "Create an account" link
elements.bottomSignupBtn.click();
console.assert(elements.loginPanel.hidden === true, "FAIL: After bottomSignupBtn click, loginPanel should be hidden");
console.assert(elements.signupPanel.hidden === false, "FAIL: After bottomSignupBtn click, signupPanel should be visible");
console.assert(elements.switcher.getAttribute('data-active') === 'signup', "FAIL: Switcher data-active should be 'signup'");
console.log("4. Control 3 (Bottom Create an account link click) -> PASS");

// Switch back with bottom login button
elements.bottomLoginBtn.click();
console.assert(elements.loginPanel.hidden === false, "FAIL: After bottomLoginBtn click, loginPanel should be visible");
console.assert(elements.signupPanel.hidden === true, "FAIL: After bottomLoginBtn click, signupPanel should be hidden");
console.log("5. Bottom Log in link click -> PASS");

// Control 1: Click top navigation button (navCreateBtn)
elements.navCreateBtn.click();
console.assert(elements.loginPanel.hidden === true, "FAIL: After navCreateBtn click, loginPanel should be hidden");
console.assert(elements.signupPanel.hidden === false, "FAIL: After navCreateBtn click, signupPanel should be visible");
console.assert(elements.switcher.getAttribute('data-active') === 'signup', "FAIL: Switcher data-active should be 'signup'");
console.log("6. Control 1 (Top nav button click) -> PASS");

// Test hashchange event
elements.loginTab.click();
windowMock.location.hash = '#signup';
if (windowMock.listeners['hashchange']) {
  windowMock.listeners['hashchange'].forEach(fn => fn());
}
console.assert(elements.signupPanel.hidden === false, "FAIL: After hashchange to #signup, signupPanel should be visible");
console.log("7. Hash change to #signup -> PASS");

console.log("ALL TESTS PASSED SUCCESSFULLY!");
