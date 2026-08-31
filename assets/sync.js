// sync.js
// The unlock-overlay bootstrap gate for cross-device sync. Everything
// else about syncing (the password, the fetches, the debounced push)
// lives in storage.js — this file only decides when the rest of the
// page is allowed to start rendering: either this device is unlocked
// and caught up with the server, or the person explicitly chose to
// keep working offline for this session.

function buildSyncOverlayHTML() {
  return '' +
    '<div class="modal-backdrop" id="sync-overlay">' +
      '<div class="modal" style="max-width:380px;" role="dialog" aria-modal="true" aria-labelledby="sync-title">' +
        '<h2 id="sync-title">Unlock loewtorials</h2>' +
        '<p class="hint" id="sync-hint">Enter the site password to sync your wizards, settings, and progress from the server.</p>' +
        '<div class="field">' +
          '<label for="sync-password-input">Password</label>' +
          '<input type="password" id="sync-password-input" autocomplete="current-password">' +
        '</div>' +
        '<p class="hint" id="sync-error" style="color:var(--danger); display:none;"></p>' +
        '<div style="display:flex; justify-content:space-between; gap:10px; margin-top:6px;">' +
          '<button class="btn btn-ghost btn-sm" id="sync-offline-btn" type="button">Continue offline</button>' +
          '<button class="btn btn-primary btn-sm" id="sync-unlock-btn" type="button">Unlock</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function mountSyncOverlay() {
  if (document.getElementById('sync-overlay')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = buildSyncOverlayHTML();
  document.body.appendChild(wrap.firstElementChild);
}

function showSyncOverlay(errorMsg) {
  mountSyncOverlay();
  document.getElementById('sync-overlay').classList.remove('hidden');
  const err = document.getElementById('sync-error');
  if (errorMsg) { err.textContent = errorMsg; err.style.display = 'block'; }
  else { err.style.display = 'none'; }
  const input = document.getElementById('sync-password-input');
  input.value = '';
  input.focus();
}

function hideSyncOverlay() {
  const overlay = document.getElementById('sync-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// The single entry point. Resolves once this device either has a
// working password and fresh data ({ ok:true }), or the person chose
// "Continue offline" ({ ok:false, reason:'offline-chosen' }). Await
// this before reading/rendering anything from Storage.
function ensureSynced() {
  return new Promise(resolve => {
    let settled = false;

    async function attempt(pw) {
      if (pw) Storage.setSitePassword(pw);
      const result = await Storage.hydrateFromServer();
      if (result.ok) {
        hideSyncOverlay();
        if (!settled) { settled = true; resolve(result); }
        return;
      }
      if (result.reason === 'unauthorized') {
        Storage.clearSitePassword();
        showSyncOverlay('Incorrect password — try again.');
        return; // wait for the next submit, page stays gated
      }
      // no-password / network / server error: don't block forever —
      // offer the password box again, but let them opt out of the gate.
      showSyncOverlay(
        (result.reason === 'network' || result.reason === 'error')
          ? 'Could not reach the server — check your connection, or continue offline.'
          : null
      );
    }

    mountSyncOverlay();
    document.getElementById('sync-unlock-btn').addEventListener('click', () => {
      const pw = document.getElementById('sync-password-input').value.trim();
      if (!pw) return;
      attempt(pw);
    });
    document.getElementById('sync-password-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('sync-unlock-btn').click();
    });
    document.getElementById('sync-offline-btn').addEventListener('click', () => {
      hideSyncOverlay();
      if (!settled) { settled = true; resolve({ ok: false, reason: 'offline-chosen' }); }
    });

    const existingPw = Storage.getSitePassword();
    if (existingPw) attempt(existingPw);
    else showSyncOverlay();
  });
}
