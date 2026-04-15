/* ═══════════════════════════════════════════════════════════════
   PWA Registration & Install Prompt  (pwa-register.js)
   Include this script in index.html just before </body>
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── 1. Register Service Worker ── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(function (reg) {
          console.log('[PWA] SW registered, scope:', reg.scope);

          /* Listen for updates */
          reg.addEventListener('updatefound', function () {
            var newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener('statechange', function () {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                /* New version available — show a subtle "Update" toast */
                showUpdateToast();
              }
            });
          });
        })
        .catch(function (err) {
          console.warn('[PWA] SW registration failed:', err);
        });

      /* When SW takes control (after update), reload once */
      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!refreshing) { refreshing = true; window.location.reload(); }
      });
    });
  }

  /* ── 2. A2HS (Add to Home Screen) Install Prompt ── */
  var deferredPrompt = null;
  var installBanner  = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', function () {
    console.log('[PWA] App installed ✓');
    hideInstallBanner();
    deferredPrompt = null;
    /* Show a quick thank-you toast */
    if (typeof toast === 'function') toast('✅ AI Tools Hub installed! Find it on your home screen.', 'ok');
  });

  function showInstallBanner() {
    if (installBanner) return; // already showing

    installBanner = document.createElement('div');
    installBanner.id = 'pwa-install-banner';
    installBanner.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">'
      + '<span style="font-size:26px;flex-shrink:0">⚡</span>'
      + '<div style="min-width:0">'
      + '<div style="font-size:14px;font-weight:700;color:#eeeef5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Install AI Tools Hub</div>'
      + '<div style="font-size:12px;color:#6b6d80;margin-top:2px">Add to home screen for instant access</div>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-shrink:0">'
      + '<button id="pwa-install-yes" style="padding:9px 16px;background:linear-gradient(135deg,#e8a430,#f5c842);border:none;border-radius:9px;color:#0a0a0a;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Install</button>'
      + '<button id="pwa-install-no"  style="padding:9px 12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#6b6d80;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">×</button>'
      + '</div>';

    Object.assign(installBanner.style, {
      position      : 'fixed',
      bottom        : 'calc(var(--bnav-h, 60px) + 10px)',
      left          : '10px',
      right         : '10px',
      zIndex        : '9990',
      background    : 'rgba(13,15,22,0.97)',
      border        : '1px solid rgba(232,164,48,0.28)',
      borderRadius  : '14px',
      padding       : '12px 14px',
      display       : 'flex',
      alignItems    : 'center',
      gap           : '10px',
      boxShadow     : '0 8px 32px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(16px)',
      animation     : 'fadeUp .35s ease both',
      maxWidth      : '480px',
      margin        : '0 auto',
    });

    document.body.appendChild(installBanner);

    document.getElementById('pwa-install-yes').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome === 'accepted') console.log('[PWA] User accepted install');
        deferredPrompt = null;
        hideInstallBanner();
      });
    });

    document.getElementById('pwa-install-no').addEventListener('click', function () {
      hideInstallBanner();
      /* Don't show again for 3 days */
      localStorage.setItem('pwa_banner_dismissed', String(Date.now()));
    });
  }

  function hideInstallBanner() {
    if (installBanner) {
      installBanner.style.opacity = '0';
      installBanner.style.transform = 'translateY(20px)';
      installBanner.style.transition = 'opacity .25s,transform .25s';
      setTimeout(function () {
        if (installBanner && installBanner.parentNode) installBanner.parentNode.removeChild(installBanner);
        installBanner = null;
      }, 280);
    }
  }

  /* Suppress banner if dismissed within the last 3 days */
  var dismissed = localStorage.getItem('pwa_banner_dismissed');
  if (dismissed && (Date.now() - parseInt(dismissed, 10)) < 3 * 24 * 60 * 60 * 1000) {
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); });
  }

  /* ── 3. Update toast ── */
  function showUpdateToast() {
    var t = document.createElement('div');
    t.innerHTML = '🔄 A new version is ready. <button id="pwa-update-btn" style="margin-left:8px;padding:4px 10px;background:#e8a430;border:none;border-radius:7px;color:#0a0a0a;font-size:12px;font-weight:700;cursor:pointer">Update</button>';
    Object.assign(t.style, {
      position     : 'fixed',
      bottom       : 'calc(var(--bnav-h, 60px) + 60px)',
      left         : '10px',
      right        : '10px',
      zIndex       : '9991',
      background   : 'rgba(13,15,22,0.97)',
      border       : '1px solid rgba(255,255,255,.12)',
      borderRadius : '12px',
      padding      : '12px 14px',
      fontSize     : '14px',
      fontWeight   : '500',
      color        : '#eeeef5',
      boxShadow    : '0 8px 24px rgba(0,0,0,.5)',
      display      : 'flex',
      alignItems   : 'center',
      animation    : 'fadeUp .3s ease',
      maxWidth     : '480px',
      margin       : '0 auto',
    });
    document.body.appendChild(t);

    document.getElementById('pwa-update-btn').addEventListener('click', function () {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
      t.remove();
    });

    setTimeout(function () { if (t.parentNode) t.remove(); }, 12000);
  }

  /* ── 4. Standalone detection (hide install banner if already installed) ── */
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    console.log('[PWA] Running in standalone mode');
    document.documentElement.classList.add('pwa-standalone');
  }

})();
