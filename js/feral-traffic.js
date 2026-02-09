/**
 * FERAL PRESENTS — Traffic Analytics Tracking
 * Tracks page views through the funnel: Landing -> Tickets -> Checkout -> Purchase
 * Data stored in Supabase traffic_events table
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
    return; // Exit early, don't set up any tracking
  }

  // Supabase configuration
  var SUPABASE_URL = 'https://rqtfghzhkkdytkegcifm.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdGZnaHpoa2tkeXRrZWdjaWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTUwMTUsImV4cCI6MjA4NTY5MTAxNX0.8IVDc92EYAq4FhTqVy0k5ur79zD9XofBBFjAuctKOUc';
  
  var SESSION_KEY = 'feral_session_id';
  var supabaseClient = null;

  // Initialize Supabase if available
  function initSupabase() {
    if (window.supabase && window.supabase.createClient && !supabaseClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('[FERAL Traffic] Supabase connected');
    }
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
    
    // Purchase confirmation (you'd need to add this page or detect via URL param)
    if (path.indexOf('/confirmation') !== -1 || window.location.search.indexOf('purchase=success') !== -1) {
      return 'purchase';
    }
    // Checkout page
    if (path.indexOf('/checkout') !== -1) {
      return 'checkout';
    }
    // Tickets page
    if (path.indexOf('/tickets') !== -1) {
      return 'tickets';
    }
    // Event landing page
    if (path.indexOf('/event/') !== -1) {
      return 'landing';
    }
    // Default - general page view
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
    initSupabase();
    
    if (!supabaseClient) {
      console.log('[FERAL Traffic] Supabase not available, skipping tracking');
      return;
    }

    var eventType = getEventType();
    var eventName = getEventName();
    var params = getUrlParams();
    var sessionId = getSessionId();
    
    // Don't track if not an event-related page
    if (eventType === 'page_view' && !eventName) {
      return;
    }

    var data = {
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
    };

    console.log('[FERAL Traffic] Tracking:', eventType, data);

    supabaseClient.from('traffic_events').insert(data).then(function(res) {
      if (res.error) {
        console.log('[FERAL Traffic] Error:', res.error.message);
      } else {
        console.log('[FERAL Traffic] Tracked successfully:', eventType);
      }
    });
  }

  // Track engagement events (scroll, time, interactions)
  window.feralTrackEngagement = function(engagementType) {
    initSupabase();

    if (!supabaseClient) return;

    var eventName = getEventName();
    var sessionId = getSessionId();

    var data = {
      event_type: engagementType,
      page_path: window.location.pathname,
      event_name: eventName,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent.substring(0, 500)
    };

    console.log('[FERAL Traffic] Engagement:', engagementType);

    supabaseClient.from('traffic_events').insert(data).then(function(res) {
      if (res.error) {
        console.log('[FERAL Traffic] Engagement error:', res.error.message);
      }
    });
  };

  // Manual tracking for purchases (call this from checkout success)
  window.feralTrackPurchase = function(orderDetails) {
    initSupabase();
    
    if (!supabaseClient) return;

    var eventName = getEventName();
    var sessionId = getSessionId();
    
    var data = {
      event_type: 'purchase',
      page_path: window.location.pathname,
      event_name: eventName,
      referrer: document.referrer || null,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent.substring(0, 500)
    };

    console.log('[FERAL Traffic] Tracking purchase:', data);

    supabaseClient.from('traffic_events').insert(data).then(function(res) {
      if (res.error) {
        console.log('[FERAL Traffic] Purchase tracking error:', res.error.message);
      } else {
        console.log('[FERAL Traffic] Purchase tracked successfully');
      }
    });
  };

  // Track on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageView);
  } else {
    // Small delay to ensure Supabase SDK is loaded
    setTimeout(trackPageView, 100);
  }
})();
