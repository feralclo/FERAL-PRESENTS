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
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "granted",
      security_storage: "granted",
      wait_for_update: 500,
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
    <>
      <div className={`cookie-banner ${visible ? "cookie-banner--visible" : ""}`}>
        <div className="cookie-banner__inner">
          <div className="cookie-banner__text">
            <p className="cookie-banner__message">
              We use cookies to improve your experience and for analytics &amp;
              marketing. You can accept all or manage your preferences.
            </p>
          </div>
          <div className="cookie-banner__actions">
            <button
              className="cookie-banner__btn cookie-banner__btn--accept"
              onClick={acceptAll}
            >
              Accept All
            </button>
            <button
              className="cookie-banner__btn cookie-banner__btn--manage"
              onClick={() => setShowPanel(true)}
            >
              Manage
            </button>
          </div>
        </div>
      </div>

      <div
        className={`cookie-panel ${showPanel ? "cookie-panel--visible" : ""}`}
      >
        <div className="cookie-panel__inner">
          <div className="cookie-panel__header">
            <span className="cookie-panel__title">Cookie Preferences</span>
            <button
              className="cookie-panel__close"
              onClick={() => setShowPanel(false)}
            >
              &times;
            </button>
          </div>
          <div className="cookie-panel__categories">
            <div className="cookie-panel__category">
              <div className="cookie-panel__category-info">
                <span className="cookie-panel__category-name">Necessary</span>
                <span className="cookie-panel__category-desc">
                  Required for the site to function. Cannot be disabled.
                </span>
              </div>
              <div className="cookie-panel__toggle cookie-panel__toggle--locked">
                <input type="checkbox" checked disabled />
                <span className="cookie-panel__slider cookie-panel__slider--locked" />
              </div>
            </div>
            <div className="cookie-panel__category">
              <div className="cookie-panel__category-info">
                <span className="cookie-panel__category-name">Analytics</span>
                <span className="cookie-panel__category-desc">
                  Helps us understand how visitors use the site.
                </span>
              </div>
              <div className="cookie-panel__toggle">
                <input
                  type="checkbox"
                  checked={analyticsChecked}
                  onChange={(e) => setAnalyticsChecked(e.target.checked)}
                />
                <span className="cookie-panel__slider" />
              </div>
            </div>
            <div className="cookie-panel__category">
              <div className="cookie-panel__category-info">
                <span className="cookie-panel__category-name">Marketing</span>
                <span className="cookie-panel__category-desc">
                  Used to deliver relevant ads and track campaign performance.
                </span>
              </div>
              <div className="cookie-panel__toggle">
                <input
                  type="checkbox"
                  checked={marketingChecked}
                  onChange={(e) => setMarketingChecked(e.target.checked)}
                />
                <span className="cookie-panel__slider" />
              </div>
            </div>
          </div>
          <div className="cookie-panel__actions">
            <button
              className="cookie-banner__btn cookie-banner__btn--accept"
              onClick={savePrefs}
            >
              Save Preferences
            </button>
            <button
              className="cookie-banner__btn cookie-banner__btn--manage"
              onClick={rejectAll}
            >
              Reject All
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
