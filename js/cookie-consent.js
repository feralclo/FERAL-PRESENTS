/**
 * FERAL PRESENTS — Cookie Consent
 * GDPR / UK PECR compliant. Integrates with GTM consent mode.
 * Shows once, remembers choice via localStorage.
 */
(function() {
  var STORAGE_KEY = 'feral_cookie_consent';
  var CONSENT_VERSION = 1;

  // Default: denied until user accepts
  function pushConsentDefaults() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'granted',
      security_storage: 'granted',
      wait_for_update: 500
    });
  }

  function pushConsentUpdate(prefs) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push('consent', 'update', {
      ad_storage: prefs.marketing ? 'granted' : 'denied',
      ad_user_data: prefs.marketing ? 'granted' : 'denied',
      ad_personalization: prefs.marketing ? 'granted' : 'denied',
      analytics_storage: prefs.analytics ? 'granted' : 'denied'
    });
  }

  function saveConsent(prefs) {
    var data = {
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      necessary: true,
      analytics: prefs.analytics,
      marketing: prefs.marketing
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch(e) {}
  }

  function getConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data.version !== CONSENT_VERSION) return null;
      return data;
    } catch(e) {
      return null;
    }
  }

  // Push defaults before GTM loads
  pushConsentDefaults();

  // If consent already given, update immediately and stop
  var existing = getConsent();
  if (existing) {
    pushConsentUpdate(existing);
    return;
  }

  // Build banner DOM
  function createBanner() {
    var banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.id = 'cookieBanner';
    banner.innerHTML =
      '<div class="cookie-banner__inner">' +
        '<div class="cookie-banner__text">' +
          '<p class="cookie-banner__message">We use cookies to improve your experience and for analytics & marketing. You can accept all or manage your preferences.</p>' +
        '</div>' +
        '<div class="cookie-banner__actions">' +
          '<button class="cookie-banner__btn cookie-banner__btn--accept" id="cookieAcceptAll">Accept All</button>' +
          '<button class="cookie-banner__btn cookie-banner__btn--manage" id="cookieManage">Manage</button>' +
        '</div>' +
      '</div>';

    // Preferences panel (hidden by default)
    var panel = document.createElement('div');
    panel.className = 'cookie-panel';
    panel.id = 'cookiePanel';
    panel.innerHTML =
      '<div class="cookie-panel__inner">' +
        '<div class="cookie-panel__header">' +
          '<span class="cookie-panel__title">Cookie Preferences</span>' +
          '<button class="cookie-panel__close" id="cookiePanelClose">&times;</button>' +
        '</div>' +
        '<div class="cookie-panel__categories">' +
          '<div class="cookie-panel__category">' +
            '<div class="cookie-panel__category-info">' +
              '<span class="cookie-panel__category-name">Necessary</span>' +
              '<span class="cookie-panel__category-desc">Required for the site to function. Cannot be disabled.</span>' +
            '</div>' +
            '<div class="cookie-panel__toggle cookie-panel__toggle--locked">' +
              '<input type="checkbox" checked disabled>' +
              '<span class="cookie-panel__slider cookie-panel__slider--locked"></span>' +
            '</div>' +
          '</div>' +
          '<div class="cookie-panel__category">' +
            '<div class="cookie-panel__category-info">' +
              '<span class="cookie-panel__category-name">Analytics</span>' +
              '<span class="cookie-panel__category-desc">Helps us understand how visitors use the site.</span>' +
            '</div>' +
            '<div class="cookie-panel__toggle">' +
              '<input type="checkbox" id="cookieAnalytics" checked>' +
              '<span class="cookie-panel__slider"></span>' +
            '</div>' +
          '</div>' +
          '<div class="cookie-panel__category">' +
            '<div class="cookie-panel__category-info">' +
              '<span class="cookie-panel__category-name">Marketing</span>' +
              '<span class="cookie-panel__category-desc">Used to deliver relevant ads and track campaign performance.</span>' +
            '</div>' +
            '<div class="cookie-panel__toggle">' +
              '<input type="checkbox" id="cookieMarketing" checked>' +
              '<span class="cookie-panel__slider"></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cookie-panel__actions">' +
          '<button class="cookie-banner__btn cookie-banner__btn--accept" id="cookieSavePrefs">Save Preferences</button>' +
          '<button class="cookie-banner__btn cookie-banner__btn--manage" id="cookieRejectAll">Reject All</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(banner);
    document.body.appendChild(panel);

    // Show banner with slight delay for smooth entrance
    setTimeout(function() {
      banner.classList.add('cookie-banner--visible');
      document.body.classList.add('cookie-banner-active');
    }, 800);

    // Wire up events
    var acceptBtn = document.getElementById('cookieAcceptAll');
    var manageBtn = document.getElementById('cookieManage');
    var closeBtn = document.getElementById('cookiePanelClose');
    var saveBtn = document.getElementById('cookieSavePrefs');
    var rejectBtn = document.getElementById('cookieRejectAll');

    function hideBanner() {
      banner.classList.remove('cookie-banner--visible');
      panel.classList.remove('cookie-panel--visible');
      document.body.classList.remove('cookie-banner-active');
      setTimeout(function() {
        if (banner.parentNode) banner.parentNode.removeChild(banner);
        if (panel.parentNode) panel.parentNode.removeChild(panel);
      }, 400);
    }

    acceptBtn.addEventListener('click', function() {
      var prefs = { analytics: true, marketing: true };
      saveConsent(prefs);
      pushConsentUpdate(prefs);
      hideBanner();
    });

    manageBtn.addEventListener('click', function() {
      panel.classList.add('cookie-panel--visible');
    });

    closeBtn.addEventListener('click', function() {
      panel.classList.remove('cookie-panel--visible');
    });

    saveBtn.addEventListener('click', function() {
      var prefs = {
        analytics: document.getElementById('cookieAnalytics').checked,
        marketing: document.getElementById('cookieMarketing').checked
      };
      saveConsent(prefs);
      pushConsentUpdate(prefs);
      hideBanner();
    });

    rejectBtn.addEventListener('click', function() {
      var prefs = { analytics: false, marketing: false };
      saveConsent(prefs);
      pushConsentUpdate(prefs);
      hideBanner();
    });
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createBanner);
  } else {
    createBanner();
  }
})();
