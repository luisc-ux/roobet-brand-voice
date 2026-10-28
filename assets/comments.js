/* ═══════════════════════════════════════════════════════════
   ROOBET BRAND VOICE: COMMENT SYSTEM (v3, for the collapsible layout)
   Depends on: config.js (CVOX_SUPABASE_URL, CVOX_SUPABASE_ANON_KEY)
═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── CONFIG GUARD: if config.js did not load, do nothing instead of crashing ── */
  if (typeof CVOX_SUPABASE_URL === 'undefined' || typeof CVOX_SUPABASE_ANON_KEY === 'undefined') {
    console.warn('Comments disabled: config.js (CVOX_SUPABASE_URL / CVOX_SUPABASE_ANON_KEY) not found.');
    return;
  }
  const SB_URL = CVOX_SUPABASE_URL;
  const SB_KEY = CVOX_SUPABASE_ANON_KEY;

  /* ── SUPABASE CLIENT ── */
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

  /* ── HELPERS ── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const txt = el => (el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  /* ── BLOCK IDENTIFICATION ──
     Each entry: a selector, plus how to label the block.
     Order matters: a block's index in the list is part of its ID. */
  const BLOCK_SELECTORS = [
    { sel: '.pr',                    label: el => txt(el.querySelector('h3')) || 'Principle' },
    { sel: '.mode',                  label: el => txt(el.querySelector('h3')) || 'Tone mode' },
    { sel: '.panel',                 label: el => txt(el.querySelector('h3')) || 'Panel' },
    { sel: '#rules .cols .mini',     label: el => txt(el.querySelector('b')) || 'Rule' },
    { sel: 'table.avoid tr',         label: el => txt(el.querySelector('td')).slice(0, 50) || 'Avoid row' },
    { sel: '.ex .row',               label: el => 'Example: ' + (txt(el.querySelector('.r')).replace(/^(Roobet|Generic)[^A-Za-z]*/i, '').slice(0, 40) || 'pair') },
    { sel: 'ol.check li',            label: el => txt(el).slice(0, 50) || 'Check' },
    { sel: '.term',                  label: el => txt(el.querySelector('b')) || 'Localization rule' },
    {
      sel: '.acc-body',
      // generic accordion content, but not the ones already covered row by row
      filter: el => !el.querySelector('.term, table.avoid, .loc-grid'),
      label: el => {
        const s = el.closest('details.acc')?.querySelector('summary');
        return s ? txt(s).replace(/\s*(EN|any draft|levers|6 questions|optional)$/i, '') : 'Section content';
      },
    },
  ];

  function labelFor(el) {
    for (const { sel, label } of BLOCK_SELECTORS) {
      if (el.matches(sel)) return label(el);
    }
    return txt(el).slice(0, 60) || 'Block';
  }

  function idFor(el, idx) {
    const section = el.closest('section')?.id || 'doc';
    const label = labelFor(el).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return `${section}__${label}__${idx}`;
  }

  function collectBlocks() {
    const seen = new Set();
    const blocks = [];
    BLOCK_SELECTORS.forEach(({ sel, filter }) => {
      document.querySelectorAll(sel).forEach(el => {
        if (seen.has(el)) return;
        if (filter && !filter(el)) return;
        seen.add(el);
        blocks.push(el);
      });
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
          <div class="cvox-modal-block-label">${esc(blockLabel)}</div>
        </div>
        <button class="cvox-modal-close" type="button">✕</button>
      </div>
      <div class="cvox-existing" id="cvox-existing-list">
        <div class="cvox-muted">Loading comments…</div>
      </div>
      <div class="cvox-divider"></div>
      <label class="cvox-form-label">Your name</label>
      <input class="cvox-input" id="cvox-name" placeholder="e.g. Natalia" autocomplete="off" />
      <label class="cvox-form-label">Comment</label>
      <textarea class="cvox-textarea" id="cvox-text" placeholder="What would you change or flag here?"></textarea>
      <button class="cvox-submit" id="cvox-send" type="button">Send comment</button>
    `;
    modal.querySelector('.cvox-modal-close').addEventListener('click', closeModal);
    overlay.classList.add('cvox-open');

    const list = modal.querySelector('#cvox-existing-list');
    try {
      const comments = await getComments(blockId);
      if (!comments || comments.length === 0) {
        list.innerHTML = '<div class="cvox-muted">No comments yet.</div>';
      } else {
        list.innerHTML = comments.map(c => `
          <div class="cvox-existing-comment">
            <div class="cvox-existing-meta">${esc(c.author_name)} · ${formatDate(c.created_at)} · <span class="cvox-status cvox-status-${esc(c.status)}">${esc(c.status)}</span></div>
            <div class="cvox-existing-text">${esc(c.content)}</div>
            ${(c.comment_replies || []).map(r => `
              <div class="cvox-existing-reply">
                <div class="cvox-existing-reply-meta">Team reply · ${formatDate(r.created_at)}</div>
                ${esc(r.content)}
              </div>
            `).join('')}
          </div>
        `).join('');
      }
    } catch (e) {
      list.innerHTML = '<div class="cvox-error">Could not load comments.</div>';
    }

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
        const host = document.querySelector(`[data-cvox-id="${CSS.escape(blockId)}"]`);
        const trigger = host && host.querySelector('.cvox-trigger');
        if (trigger) {
          trigger.classList.add('has-comments');
          const count = trigger.querySelector('.cvox-count');
          if (count) count.textContent = parseInt(count.textContent || '0', 10) + 1;
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

  /* ── REVEAL A BLOCK: open any collapsed sections / accordions / tabs around it ── */
  function revealBlock(el) {
    let node = el;
    while (node && node !== document.body) {
      if (node.matches && node.matches('details')) node.open = true;
      if (node.matches && node.matches('.panel') && !node.classList.contains('on')) {
        const tab = document.querySelector(`.tabs button[data-t="${node.id}"]`);
        if (tab) tab.click();
      }
      node = node.parentElement;
    }
  }

  /* ── INIT ── */
  async function init() {
    let counts = {};
    try { counts = await getAllBlockCounts(); } catch (e) { /* silently fail */ }

    const blocks = collectBlocks();
    blocks.forEach((el, idx) => {
      const blockId = idFor(el, idx);
      const blockLabel = labelFor(el);

      // table rows can't host a button directly, so the last cell hosts it
      const host = el.matches('tr') ? (el.lastElementChild || el) : el;

      el.classList.add('cvox-block');
      el.setAttribute('data-cvox-id', blockId);
      host.classList.add('cvox-host');

      const trigger = document.createElement('button');
      trigger.type = 'button';
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
        e.preventDefault();
        openModal(blockId, blockLabel);
      });

      host.appendChild(trigger);
    });

    // Deep link from the review page: index.html?highlight=<block id>
    const highlight = new URLSearchParams(window.location.search).get('highlight');
    if (highlight) {
      const target = document.querySelector(`[data-cvox-id="${CSS.escape(highlight)}"]`);
      if (target) {
        revealBlock(target);
        target.classList.add('cvox-highlighted');
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
