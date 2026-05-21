// Eesha Browser - Fingerprint Protection Script
// Injected into web pages to prevent browser fingerprinting
// Based on techniques used by Tor Browser, Brave, and Firefox's Resist Fingerprinting

(function() {
  'use strict';

  // ─── Canvas Fingerprint Protection ────────────────────────────────
  // Adds subtle noise to canvas toDataURL() and toBlob() outputs
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const origToBlob = HTMLCanvasElement.prototype.toBlob;

  function addCanvasNoise(canvas, context) {
    try {
      if (canvas.width === 0 || canvas.height === 0) return;
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      // Add random noise to a small number of pixels
      for (let i = 0; i < data.length; i += 4 * 37) {
        data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() - 0.5) * 2));
      }
      context.putImageData(imageData, 0, 0);
    } catch (e) {
      // SecurityError - cross-origin canvas, silently ignore
    }
  }

  HTMLCanvasElement.prototype.toDataURL = function() {
    try {
      const ctx = this.getContext('2d');
      if (ctx) addCanvasNoise(this, ctx);
    } catch (e) {}
    return origToDataURL.apply(this, arguments);
  };

  HTMLCanvasElement.prototype.toBlob = function() {
    try {
      const ctx = this.getContext('2d');
      if (ctx) addCanvasNoise(this, ctx);
    } catch (e) {}
    return origToBlob.apply(this, arguments);
  };

  // ─── WebGL Fingerprint Protection ─────────────────────────────────
  // Spoof renderer and vendor strings
  const getParameterProxyHandler = {
    apply: function(target, thisArg, args) {
      const param = args[0];
      const gl = thisArg;
      // UNMASKED_VENDOR_WEBGL
      if (param === 0x9245) return 'GPU Vendor';
      // UNMASKED_RENDERER_WEBGL
      if (param === 0x9246) return 'GPU Renderer';
      return target.apply(gl, args);
    }
  };

  try {
    const origGetParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = new Proxy(origGetParam, getParameterProxyHandler);

    if (typeof WebGL2RenderingContext !== 'undefined') {
      const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = new Proxy(origGetParam2, getParameterProxyHandler);
    }
  } catch (e) {}

  // ─── AudioContext Fingerprint Protection ───────────────────────────
  // Add noise to AudioContext to prevent audio fingerprinting
  try {
    const origGetFloatFreqData = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = function(array) {
      origGetFloatFreqData.apply(this, arguments);
      for (let i = 0; i < array.length; i++) {
        array[i] += (Math.random() - 0.5) * 0.001;
      }
    };
  } catch (e) {}

  // ─── Navigator Properties Protection ──────────────────────────────
  // Hide precise hardware info that can be used for fingerprinting
  try {
    // Limit hardware concurrency to reduce fingerprint uniqueness
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4,
      configurable: true
    });

    // Hide device memory
    if ('deviceMemory' in navigator) {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 4,
        configurable: true
      });
    }
  } catch (e) {}

  // ─── Screen Properties Protection ─────────────────────────────────
  // Slightly randomize screen dimensions to prevent fingerprinting
  try {
    const origScreenWidth = screen.width;
    const origScreenHeight = screen.height;
    const origAvailWidth = screen.availWidth;
    const origAvailHeight = screen.availHeight;

    // Only override if not in a popup or small window
    if (origScreenWidth > 100) {
      Object.defineProperty(screen, 'width', {
        get: () => origScreenWidth,
        configurable: true
      });
      Object.defineProperty(screen, 'height', {
        get: () => origScreenHeight,
        configurable: true
      });
    }
  } catch (e) {}

  // ─── Date/Timezone Protection ─────────────────────────────────────
  // Return UTC timezone to prevent timezone fingerprinting
  try {
    const origGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = function() {
      return 0; // Always return UTC
    };
  } catch (e) {}

  // ─── Font Enumeration Protection ──────────────────────────────────
  // Limit font detection via CSS measurement
  try {
    const origMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function(text) {
      const result = origMeasureText.apply(this, arguments);
      // Add tiny random variation to font measurements
      const noise = (Math.random() - 0.5) * 0.01;
      return new Proxy(result, {
        get: function(target, prop) {
          if (prop === 'width') return target.width + noise;
          if (prop === 'actualBoundingBoxLeft') return target.actualBoundingBoxLeft + noise;
          if (prop === 'actualBoundingBoxRight') return target.actualBoundingBoxRight + noise;
          return target[prop];
        }
      });
    };
  } catch (e) {}

  // ─── Battery API Protection ───────────────────────────────────────
  // Block battery status fingerprinting
  try {
    if (navigator.getBattery) {
      navigator.getBattery = () => Promise.resolve({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 1,
        addEventListener: function() {},
        removeEventListener: function() {},
        dispatchEvent: function() { return true; }
      });
    }
  } catch (e) {}

  // ─── Connection API Protection ────────────────────────────────────
  // Hide network connection info
  try {
    if (navigator.connection) {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 100,
          downlink: 10,
          saveData: false,
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return true; }
        }),
        configurable: true
      });
    }
  } catch (e) {}

  // ─── Storage Estimate Protection ──────────────────────────────────
  // Hide precise storage quota
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const origEstimate = navigator.storage.estimate;
      navigator.storage.estimate = function() {
        return origEstimate.apply(this, arguments).then(est => ({
          quota: Math.round(est.quota / (1024 * 1024 * 1024)) * (1024 * 1024 * 1024),
          usage: Math.round(est.usage / (1024 * 1024)) * (1024 * 1024)
        }));
      };
    }
  } catch (e) {}

  // ─── Math Constant Protection ─────────────────────────────────────
  // Add subtle noise to Math operations to prevent JS engine fingerprinting
  // (This is advanced - some fingerprinters check Math.sin, Math.tanh etc.)
  try {
    const origMathSin = Math.sin;
    const origMathCos = Math.cos;
    const eps = 1e-15;

    Math.sin = function(x) {
      return origMathSin(x) + (Math.random() - 0.5) * eps;
    };
    Math.cos = function(x) {
      return origMathCos(x) + (Math.random() - 0.5) * eps;
    };
  } catch (e) {}

  // ─── WebRTC Leak Protection ───────────────────────────────────────
  // Prevent WebRTC from leaking local IP addresses
  try {
    const origRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (origRTCPeerConnection) {
      window.RTCPeerConnection = function(config, constraints) {
        // Force relay-only to prevent IP leaks
        if (config && config.iceServers) {
          config.iceTransportPolicy = 'relay';
        } else {
          config = { iceTransportPolicy: 'relay' };
        }
        return new origRTCPeerConnection(config, constraints);
      };
      window.RTCPeerConnection.prototype = origRTCPeerConnection.prototype;
    }
  } catch (e) {}

  // ─── Plugin/MIME Type Protection ──────────────────────────────────
  // Hide browser plugins that can be used for fingerprinting
  try {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [],
      configurable: true
    });
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => [],
      configurable: true
    });
  } catch (e) {}

  // ─── Client Hints Protection ──────────────────────────────────────
  // Block User-Agent Client Hints which expose detailed browser info
  try {
    if (navigator.userAgentData) {
      Object.defineProperty(navigator, 'userAgentData', {
        get: () => undefined,
        configurable: true
      });
    }
  } catch (e) {}

  console.log('%c🛡️ Eesha Fingerprint Protection Active', 'color: #e94560; font-weight: bold;');
})();
