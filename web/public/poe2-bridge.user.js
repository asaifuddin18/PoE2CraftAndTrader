// ==UserScript==
// @name         PoE2 Craft & Trade — Bridge
// @namespace    https://po-e2-craft-and-trader.vercel.app
// @version      1.0.0
// @description  Proxies GGG trade API calls through your browser so they use your IP and session cookies.
// @author       PoE2 Craft & Trade
// @match        https://po-e2-craft-and-trader.vercel.app/*
// @match        http://localhost:3000/*
// @grant        GM_xmlhttpRequest
// @connect      www.pathofexile.com
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // Tell the page the bridge is available as early as possible
  function signalReady() {
    window.dispatchEvent(new CustomEvent('poe2:bridge-ready'));
  }

  // Signal on load and after a short delay to catch late listeners
  signalReady();
  window.addEventListener('load', signalReady);
  setTimeout(signalReady, 500);

  // Listen for trade requests from the page
  window.addEventListener('poe2:trade-request', function (e) {
    const { id, url, method, body, headers } = e.detail;

    GM_xmlhttpRequest({
      method: method || 'GET',
      url: url,
      headers: headers || {},
      data: body || null,
      // The browser automatically sends pathofexile.com cookies (including
      // HttpOnly POESESSID and cf_clearance) — we never read them directly.
      anonymous: false,
      onload: function (res) {
        window.dispatchEvent(new CustomEvent('poe2:trade-response', {
          detail: {
            id,
            status: res.status,
            data: res.responseText,
          },
        }));
      },
      onerror: function () {
        window.dispatchEvent(new CustomEvent('poe2:trade-response', {
          detail: { id, error: 'Network error' },
        }));
      },
      ontimeout: function () {
        window.dispatchEvent(new CustomEvent('poe2:trade-response', {
          detail: { id, error: 'Request timed out' },
        }));
      },
    });
  });
})();
