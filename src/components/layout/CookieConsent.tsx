"use client";

import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "feral_cookie_consent";
const CONSENT_VERSION = 1;

interface ConsentPrefs {
  analytics: boolean;
  marketing: boolean;
}

function pushConsentDefaults() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    "0": "consent",
    "1": "default",
    "2": {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
      functionality_storage: "granted",
      security_storage: "granted",
    },
  });
}

function pushConsentUpdate(prefs: ConsentPrefs) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    "0": "consent",
    "1": "update",
    "2": {
      ad_storage: prefs.marketing ? "granted" : "denied",
      ad_user_data: prefs.marketing ? "granted" : "denied",
      ad_personalization: prefs.marketing ? "granted" : "denied",
      analytics_storage: prefs.analytics ? "granted" : "denied",
    },
  });
}

function saveConsent(prefs: ConsentPrefs) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_VERSION,
        timestamp: new Date().toISOString(),
        necessary: true,
        ...prefs,
      })
    );
    // Notify same-tab listeners (StorageEvent only fires in other tabs)
    window.dispatchEvent(new Event("feral_consent_update"));
  } catch {
    // ignore
  }
}

function getConsent(): ConsentPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== CONSENT_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [analyticsChecked, setAnalyticsChecked] = useState(true);
  const [marketingChecked, setMarketingChecked] = useState(true);

  useEffect(() => {
    pushConsentDefaults();

    const existing = getConsent();
    if (existing) {
      pushConsentUpdate(existing);
      return;
    }

    // Show banner after delay
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const hideBanner = useCallback(() => {
    setVisible(false);
    setShowPanel(false);
  }, []);

  const acceptAll = useCallback(() => {
    const prefs = { analytics: true, marketing: true };
    saveConsent(prefs);
    pushConsentUpdate(prefs);
    hideBanner();
  }, [hideBanner]);

  const rejectAll = useCallback(() => {
    const prefs = { analytics: false, marketing: false };
    saveConsent(prefs);
    pushConsentUpdate(prefs);
    hideBanner();
  }, [hideBanner]);

  const savePrefs = useCallback(() => {
    const prefs = {
      analytics: analyticsChecked,
      marketing: marketingChecked,
    };
    saveConsent(prefs);
    pushConsentUpdate(prefs);
    hideBanner();
  }, [analyticsChecked, marketingChecked, hideBanner]);

  if (!visible) return null;

  return (
    <aside className={`cookie-consent${visible ? " cookie-consent--visible" : ""}`}>
      {/* Banner view */}
      <div className={`cookie-consent__banner${showPanel ? " cookie-consent__banner--hidden" : ""}`}>
        <p className="cookie-consent__message">
          We use cookies for analytics &amp; marketing to improve your
          experience. You can accept all or manage your preferences.
        </p>
        <div className="cookie-consent__actions">
          <button
            className="cookie-consent__btn cookie-consent__btn--accept"
            onClick={acceptAll}
          >
            Accept All
          </button>
          <button
            className="cookie-consent__btn cookie-consent__btn--manage"
            onClick={() => setShowPanel(true)}
          >
            Manage
          </button>
        </div>
      </div>

      {/* Preferences panel */}
      <div className={`cookie-consent__prefs${showPanel ? " cookie-consent__prefs--visible" : ""}`}>
        <div className="cookie-consent__prefs-header">
          <span className="cookie-consent__prefs-title">Cookie Preferences</span>
          <button
            className="cookie-consent__prefs-close"
            onClick={() => setShowPanel(false)}
            aria-label="Close preferences"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="cookie-consent__categories">
          {/* Necessary — locked */}
          <div className="cookie-consent__category">
            <div className="cookie-consent__category-info">
              <span className="cookie-consent__category-name">Necessary</span>
              <span className="cookie-consent__category-desc">
                Required for the site to function
              </span>
            </div>
            <label className="cookie-toggle cookie-toggle--locked">
              <input type="checkbox" checked disabled />
              <span className="cookie-toggle__track" />
            </label>
          </div>

          <div className="cookie-consent__divider" />

          {/* Analytics */}
          <div className="cookie-consent__category">
            <div className="cookie-consent__category-info">
              <span className="cookie-consent__category-name">Analytics</span>
              <span className="cookie-consent__category-desc">
                Helps us understand how visitors use the site
              </span>
            </div>
            <label className="cookie-toggle">
              <input
                type="checkbox"
                checked={analyticsChecked}
                onChange={(e) => setAnalyticsChecked(e.target.checked)}
              />
              <span className="cookie-toggle__track" />
            </label>
          </div>

          <div className="cookie-consent__divider" />

          {/* Marketing */}
          <div className="cookie-consent__category">
            <div className="cookie-consent__category-info">
              <span className="cookie-consent__category-name">Marketing</span>
              <span className="cookie-consent__category-desc">
                Used to deliver relevant ads and track campaigns
              </span>
            </div>
            <label className="cookie-toggle">
              <input
                type="checkbox"
                checked={marketingChecked}
                onChange={(e) => setMarketingChecked(e.target.checked)}
              />
              <span className="cookie-toggle__track" />
            </label>
          </div>
        </div>

        <div className="cookie-consent__actions">
          <button
            className="cookie-consent__btn cookie-consent__btn--accept"
            onClick={savePrefs}
          >
            Save Preferences
          </button>
          <button
            className="cookie-consent__btn cookie-consent__btn--manage"
            onClick={rejectAll}
          >
            Reject All
          </button>
        </div>
      </div>
    </aside>
  );
}
