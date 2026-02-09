/**
 * FERAL PRESENTS — Traffic Analytics Tracking
 * Tracks page views through the funnel: Event Page -> Add to Cart -> Checkout -> Purchase
 * Uses Supabase REST API directly via fetch() — no SDK dependency required
 */
(function() {
  'use strict';

  // ===== DEV MODE - Skip tracking for your own browsing =====
  // Visit any page with ?devmode=1 to enable (persists forever)
  // Visit with ?devmode=0 to disable and resume tracking
  var DEV_MODE_KEY = 'feral_dev_mode';

  // Check URL params to set/clear dev mode
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('devmode') === '1') {
    localStorage.setItem(DEV_MODE_KEY, 'true');
    console.log('[FERAL Traffic] DEV MODE ENABLED - Your traffic will not be tracked');
  } else if (urlParams.get('devmode') === '0') {
    localStorage.removeItem(DEV_MODE_KEY);
    console.log('[FERAL Traffic] Dev mode disabled - Tracking resumed');
  }

  // Check if dev mode is active
  var isDevMode = localStorage.getItem(DEV_MODE_KEY) === 'true';
  if (isDevMode) {
    console.log('[FERAL Traffic] Dev mode active - Skipping all tracking');
    // Still expose empty functions so other scripts don't error
    window.feralTrackEngagement = function() {};
    window.feralTrackPurchase = function() {};
    window.feralTrackAddToCart = function() {};
    return; // Exit early, don't set up any tracking
  }

  // Supabase REST API configuration (no SDK needed)
  var SUPABASE_URL = 'https://rqtfghzhkkdytkegcifm.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdGZnaHpoa2tkeXRrZWdjaWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTUwMTUsImV4cCI6MjA4NTY5MTAxNX0.8IVDc92EYAq4FhTqVy0k5ur79zD9XofBBFjAuctKOUc';
  var REST_ENDPOINT = SUPABASE_URL + '/rest/v1/traffic_events';

  var SESSION_KEY = 'feral_session_id';

  // Insert event via Supabase REST API using fetch()
  function insertEvent(data) {
    return fetch(REST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    }).then(function(res) {
      if (!res.ok) {
        return res.text().then(function(text) {
          console.error('[FERAL Traffic] Insert failed (' + res.status + '):', text);
          return { ok: false, status: res.status, error: text };
        });
      }
      console.log('[FERAL Traffic] Tracked:', data.event_type);
      return { ok: true };
    }).catch(function(err) {
      console.error('[FERAL Traffic] Network error:', err.message);
      return { ok: false, error: err.message };
    });
  }

  // Generate or retrieve session ID
  function getSessionId() {
    var sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  }

  // Get URL parameters
  function getUrlParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null
    };
  }

  // Determine event type based on current path
  function getEventType() {
    var path = window.location.pathname;

    if (path.indexOf('/confirmation') !== -1 || window.location.search.indexOf('purchase=success') !== -1) {
      return 'purchase';
    }
    if (path.indexOf('/checkout') !== -1) {
      return 'checkout';
    }
    if (path.indexOf('/tickets') !== -1) {
      return 'tickets';
    }
    if (path.indexOf('/event/') !== -1) {
      return 'landing';
    }
    return 'page_view';
  }

  // Extract event name from path (e.g., 'liverpool-27-march')
  function getEventName() {
    var path = window.location.pathname;
    var match = path.match(/\/event\/([^\/]+)/);
    return match ? match[1] : null;
  }

  // Track page view
  function trackPageView() {
    var eventType = getEventType();
    var eventName = getEventName();
    var params = getUrlParams();
    var sessionId = getSessionId();

    // Don't track if not an event-related page
    if (eventType === 'page_view' && !eventName) {
      return;
    }

    insertEvent({
      event_type: eventType,
      page_path: window.location.pathname,
      event_name: eventName,
      referrer: document.referrer || null,
      utm_source: params.utm_source,
      utm_medium: params.utm_medium,
      utm_campaign: params.utm_campaign,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent.substring(0, 500)
    });
  }

  // Track engagement events (scroll, time, interactions)
  window.feralTrackEngagement = function(engagementType) {
    insertEvent({
      event_type: engagementType,
      page_path: window.location.pathname,
      event_name: getEventName(),
      session_id: getSessionId(),
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent.substring(0, 500)
    });
  };

  // Track add-to-cart events
  // Only one add_to_cart event per session (deduped) — multiple items still count as one funnel step
  var ADD_TO_CART_KEY = 'feral_cart_tracked';

  window.feralTrackAddToCart = function(productName, productPrice, quantity) {
    // Deduplicate: only track one add_to_cart per session
    if (sessionStorage.getItem(ADD_TO_CART_KEY)) {
      console.log('[FERAL Traffic] Add to cart already tracked this session, skipping');
      return;
    }

    insertEvent({
      event_type: 'add_to_cart',
      page_path: window.location.pathname,
      event_name: getEventName(),
      session_id: getSessionId(),
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent.substring(0, 500),
      product_name: productName || null,
      product_price: productPrice || null,
      product_qty: quantity || 1
    }).then(function(result) {
      if (result && result.ok) {
        sessionStorage.setItem(ADD_TO_CART_KEY, 'true');
      }
    });
  };

  // Manual tracking for purchases (call this from checkout success)
  window.feralTrackPurchase = function(orderDetails) {
    insertEvent({
      event_type: 'purchase',
      page_path: window.location.pathname,
      event_name: getEventName(),
      referrer: document.referrer || null,
      session_id: getSessionId(),
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent.substring(0, 500)
    });
  };

  // Track on page load — no SDK dependency, runs immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageView);
  } else {
    trackPageView();
  }
})();
