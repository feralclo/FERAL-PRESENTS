/**
 * FERAL PRESENTS — Settings Persistence Layer
 * Loads/saves admin settings via Supabase (server) with localStorage as cache.
 * Settings saved in admin are available on ANY browser/device.
 *
 * Usage (event pages):
 *   feralSettings.load('feral_event_liverpool', function(settings) { ... });
 *
 * Usage (admin panel):
 *   feralSettings.save('feral_event_liverpool', settingsObj, function(err) { ... });
 */
(function() {
  'use strict';

  var SUPABASE_URL = 'https://rqtfghzhkkdytkegcifm.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdGZnaHpoa2tkeXRrZWdjaWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMTUwMTUsImV4cCI6MjA4NTY5MTAxNX0.8IVDc92EYAq4FhTqVy0k5ur79zD9XofBBFjAuctKOUc';
  var TABLE = 'site_settings';

  var client = null;

  function getClient() {
    if (!client && window.supabase && window.supabase.createClient) {
      // Custom fetch wrapper: always bypass browser HTTP cache for Supabase queries.
      // Without this, browsers (especially mobile) can serve stale cached API responses.
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          fetch: function(url, options) {
            options = options || {};
            options.cache = 'no-store';
            return fetch(url, options);
          }
        }
      });
    }
    return client;
  }

  /**
   * Load settings for a given key.
   * Tries Supabase first, falls back to localStorage, then defaults.
   * @param {string} key - e.g. 'feral_event_liverpool'
   * @param {function} callback - function(settings) called with the parsed object (or null)
   */
  function load(key, callback) {
    var sb = getClient();
    if (!sb) {
      // No Supabase — use localStorage fallback
      console.log('[FERAL Settings] Supabase unavailable, using localStorage for', key);
      var local = localStorage.getItem(key);
      callback(local ? JSON.parse(local) : null);
      return;
    }

    sb.from(TABLE).select('data').eq('key', key).single().then(function(res) {
      if (res.error || !res.data) {
        // Row doesn't exist yet or error — fall back to localStorage
        console.log('[FERAL Settings] No server data for', key, '- using localStorage');
        var local = localStorage.getItem(key);
        callback(local ? JSON.parse(local) : null);
      } else {
        var settings = res.data.data;
        // Update localStorage cache so it stays in sync
        try { localStorage.setItem(key, JSON.stringify(settings)); } catch (e) {}
        console.log('[FERAL Settings] Loaded from server:', key);
        callback(settings);
      }
    });
  }

  /**
   * Synchronous load from localStorage cache only (for blocking scripts in <head>).
   * Event pages that need settings before render should use this, then async-refresh after DOM ready.
   * @param {string} key
   * @returns {object|null}
   */
  function loadCached(key) {
    try {
      var stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Save settings to Supabase AND localStorage.
   * Uses upsert so it works whether the row exists or not.
   * @param {string} key
   * @param {object} data - the settings object to save
   * @param {function} [callback] - optional function(error) — null on success
   */
  function save(key, data, callback) {
    callback = callback || function() {};

    // Always save to localStorage as cache
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('[FERAL Settings] localStorage save failed:', e);
    }

    var sb = getClient();
    if (!sb) {
      console.warn('[FERAL Settings] Supabase unavailable — saved to localStorage only');
      callback(new Error('Supabase not available'));
      return;
    }

    sb.from(TABLE).upsert({
      key: key,
      data: data,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' }).then(function(res) {
      if (res.error) {
        console.error('[FERAL Settings] Server save failed:', res.error.message);
        callback(res.error);
      } else {
        console.log('[FERAL Settings] Saved to server:', key);
        callback(null);
      }
    });
  }

  /**
   * Delete a settings key from both Supabase and localStorage.
   * @param {string} key
   * @param {function} [callback] - optional function(error)
   */
  function remove(key, callback) {
    callback = callback || function() {};
    localStorage.removeItem(key);

    var sb = getClient();
    if (!sb) {
      callback(null);
      return;
    }

    sb.from(TABLE).delete().eq('key', key).then(function(res) {
      if (res.error) {
        console.error('[FERAL Settings] Server delete failed:', res.error.message);
        callback(res.error);
      } else {
        console.log('[FERAL Settings] Deleted from server:', key);
        callback(null);
      }
    });
  }

  // Expose globally
  window.feralSettings = {
    load: load,
    loadCached: loadCached,
    save: save,
    remove: remove
  };
})();
