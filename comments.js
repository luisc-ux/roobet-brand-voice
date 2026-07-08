/* ═══════════════════════════════════════════════════════════
   ROOBET BRAND VOICE — COMMENT SYSTEM
   Depends on: config.js (CVOX_SUPABASE_URL, CVOX_SUPABASE_ANON_KEY)
═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── SUPABASE CLIENT ── */
  const SB_URL = CVOX_SUPABASE_URL;
  const SB_KEY = CVOX_SUPABASE_ANON_KEY;

  async function sbFetch(path, opts = {}) {
    const res = await fetch(SB_URL + '/rest/v1/' + path, {
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': opts.prefer || 'return=representation',
        ...opts.headers,
      },
      ...opts,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function getComments(blockId) {
    return sbFetch('comments?block_id=eq.' + encodeURIComponent(blockId) + '&order=created_at.asc&select=*,comment_replies(*)');
  }

  async function getAllBlockCounts() {
    const rows = await sbFetch('comments?select=block_id&status=neq.rejected');
    const counts = {};
    (rows || []).forEach(r => {
      counts[r.block_id] = (counts[r.block_id] || 0) + 1;
    });
    return counts;
  }

  async function postComment(blockId, blockLabel, authorName, text) {
    return sbFetch('comments', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        block_id: blockId,
        block_label: blockLabel,
        author_name: authorName,
        content: text,
        status: 'pending',
      }),
    });
  }

  /* ── BLOCK IDENTIFICATION ── */
  const BLOCK_SELECTORS = [
    { sel: '.principle',       label: el => el.querySelector('.principle-title')?.textContent?.trim() || 'Principle' },
    { sel: '.tone-card',       label: el => el.querySelector('.tone-card-label')?.textContent?.trim() || 'Tone card' },
    { sel: '.channel-content', label: el => el.querySelector('.channel-content-title')?.textContent?.trim() || 'Channel' },
    { sel: '.inspo-card',      label: el => el.querySelector('.inspo-brand')?.textContent?.trim() || 'Inspiration' },
    { sel: '.feedback-type',   label: el => el.querySelector('h3')?.textContent?.trim() || 'Feedback type' },
    { sel: '.avoid-row',       label: el => el.querySelector('.avoid-bad')?.textContent?.trim() || 'Avoid' },
    { sel: 'li.checklist-item',label: el => el.querySelector('span')?.textContent?.trim().slice(0, 60) || 'Checklist item' },
    { sel: '.lang-rule',       label: el => el.querySelector('.lang-rule-title')?.textContent?.trim() || 'Language rule' },
    { sel: 'table.compare-table tbody tr', label: el => el.querySelector('td')?.textContent?.trim().slice(0, 40) || 'Table row' },
  ];

  function labelFor(el) {
    for (const { sel, label } of BLOCK_SELECTORS) {
      if (el.matches(sel)) return label(el);
    }
    return el.textContent?.trim().slice(0, 60) || 'Block';
  }

  function idFor(el, idx) {
    // Prefer a stable ID based on section + label
    const section = el.closest('section')?.id || 'doc';
    const label = labelFor(el).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    return `${section}__${label}__${idx}`;
  }

  function collectBlocks() {
    const seen = new Set();
    const blocks = [];

    BLOCK_SELECTORS.forEach(({ sel }) => {
      document.querySelectorAll(sel).forEach(el => {
        if (!seen.has(el)) {
          seen.add(el);
          blocks.push(el);
        }
      });
    });

    // Fallback: find card-like containers not already tagged
    document.querySelectorAll('[style*="background:var(--white-faint)"], [style*="background:var(--purple-card)"], .loc-rule-pill, .loc-rule-card, .spanish-rule, .lang-rule').forEach(el => {
      if (!seen.has(el) && el.textContent.trim().length > 20) {
        seen.add(el);
        blocks.push(el);
      }
    });

    return blocks;
  }

  /* ── UI HELPERS ── */
  function showToast(msg) {
    let t = document.querySelector('.cvox-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'cvox-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('cvox-show');
    setTimeout(() => t.classList.remove('cvox-show'), 2800);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
           ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  /* ── MODAL ── */
  let overlay = null;

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'cvox-overlay';
    overlay.innerHTML = '<div class="cvox-modal"></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('cvox-open');
  }

  async function openModal(blockId, blockLabel) {
    if (!overlay) buildOverlay();
    const modal = overlay.querySelector('.cvox-modal');
    modal.innerHTML = `
      <div class="cvox-modal-header">
        <div>
          <div class="cvox-modal-title">Leave a comment</div>
          <div class="cvox-modal-block-label">${blockLabel}</div>
        </div>
        <button class="cvox-modal-close" onclick="this.closest('.cvox-overlay').classList.remove('cvox-open')">✕</button>
      </div>
      <div class="cvox-existing" id="cvox-existing-list">
        <div style="font-size:13px;color:rgba(245,242,236,0.35);font-style:italic;">Loading comments…</div>
      </div>
      <div class="cvox-divider"></div>
      <label class="cvox-form-label">Your name</label>
      <input class="cvox-input" id="cvox-name" placeholder="e.g. Natalia" autocomplete="off" />
      <label class="cvox-form-label">Comment</label>
      <textarea class="cvox-textarea" id="cvox-text" placeholder="What would you change or flag here?"></textarea>
      <button class="cvox-submit" id="cvox-send">Send comment</button>
    `;

    overlay.classList.add('cvox-open');

    // Load existing comments
    const list = modal.querySelector('#cvox-existing-list');
    try {
      const comments = await getComments(blockId);
      if (!comments || comments.length === 0) {
        list.innerHTML = '<div style="font-size:13px;color:rgba(245,242,236,0.3);font-style:italic;">No comments yet.</div>';
      } else {
        list.innerHTML = comments.map(c => `
          <div class="cvox-existing-comment">
            <div class="cvox-existing-meta">${c.author_name} · ${formatDate(c.created_at)} · <span style="text-transform:uppercase;letter-spacing:1px;font-size:9px;color:${c.status === 'approved' ? '#52C887' : c.status === 'rejected' ? '#E05252' : 'rgba(245,242,236,0.35)'}">${c.status}</span></div>
            <div class="cvox-existing-text">${c.content}</div>
            ${(c.comment_replies || []).map(r => `
              <div class="cvox-existing-reply">
                <div class="cvox-existing-reply-meta">Team reply · ${formatDate(r.created_at)}</div>
                ${r.content}
              </div>
            `).join('')}
          </div>
        `).join('');
      }
    } catch (e) {
      list.innerHTML = '<div style="font-size:12px;color:#E05252;">Could not load comments.</div>';
    }

    // Submit handler
    modal.querySelector('#cvox-send').addEventListener('click', async () => {
      const name = modal.querySelector('#cvox-name').value.trim();
      const text = modal.querySelector('#cvox-text').value.trim();
      if (!name || !text) {
        showToast('Please enter your name and comment.');
        return;
      }
      const btn = modal.querySelector('#cvox-send');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await postComment(blockId, blockLabel, name, text);
        closeModal();
        showToast('Comment sent. Thanks!');
        // Update trigger counter
        const trigger = document.querySelector(`[data-cvox-id="${blockId}"] .cvox-trigger`);
        if (trigger) {
          trigger.classList.add('has-comments');
          const count = trigger.querySelector('.cvox-count');
          if (count) count.textContent = parseInt(count.textContent || '0') + 1;
          else {
            const c = document.createElement('span');
            c.className = 'cvox-count';
            c.textContent = '1';
            trigger.appendChild(c);
          }
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Send comment';
        showToast('Error sending comment. Try again.');
      }
    });
  }

  /* ── INIT ── */
  async function init() {
    // Load comment counts for all blocks
    let counts = {};
    try { counts = await getAllBlockCounts(); } catch (e) { /* silently fail */ }

    const blocks = collectBlocks();
    blocks.forEach((el, idx) => {
      const blockId = idFor(el, idx);
      const blockLabel = labelFor(el);

      el.classList.add('cvox-block');
      el.setAttribute('data-cvox-id', blockId);

      // Build trigger button
      const trigger = document.createElement('button');
      trigger.className = 'cvox-trigger';
      trigger.title = 'Leave a comment on this block';
      trigger.innerHTML = '💬';

      if (counts[blockId]) {
        trigger.classList.add('has-comments');
        const countBadge = document.createElement('span');
        countBadge.className = 'cvox-count';
        countBadge.textContent = counts[blockId];
        trigger.appendChild(countBadge);
      }

      trigger.addEventListener('click', e => {
        e.stopPropagation();
        openModal(blockId, blockLabel);
      });

      el.appendChild(trigger);
    });

    // Handle highlight from review panel
    const params = new URLSearchParams(window.location.search);
    const highlight = params.get('highlight');
    if (highlight) {
      const target = document.querySelector(`[data-cvox-id="${highlight}"]`);
      if (target) {
        target.classList.add('cvox-highlighted');
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
