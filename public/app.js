/**
 * public/app.js
 * ─────────────────────────────────────────────────────────────────────────
 * Frontend application for the Pitch Perfect Kits catalog.
 *
 * Data source: jerseys.json (same folder), produced by importer/run.js.
 * Image source: local files under images/<albumId>/<n>.jpg — NEVER a
 * Yupoo URL. If jerseys.json somehow contains a non-local image path,
 * renderCard() will simply fail to load it (no fallback to any remote
 * Yupoo URL is implemented anywhere in this file, by design).
 *
 * Sections:
 *   1. State & data loading
 *   2. Filtering / sorting
 *   3. Grid rendering with lazy-loaded images (IntersectionObserver)
 *   4. Gallery modal (keyboard + touch friendly)
 * ─────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ── 1. STATE ──────────────────────────────────────────────────────────
  const state = {
    all: [],          // full jersey list from jerseys.json
    category: 'all',
    type: 'all',
    region: 'all',
    search: '',
    sort: 'default',
  };

  const TAG_LABELS = {
    home: 'Home', away: 'Away', third: 'Third Kit', player: 'Player Ver.',
    special: 'Special', training: 'Training', gk: 'Goalkeeper',
  };

  function tagLabel(t) { return TAG_LABELS[t] || t; }

  // ── DOM refs ──────────────────────────────────────────────────────────
  const grid = document.getElementById('grid');
  const resultCount = document.getElementById('resultCount');
  const headerCount = document.getElementById('headerCount');
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');

  // ── 2. DATA LOADING ───────────────────────────────────────────────────
  async function loadJerseys() {
    try {
      const res = await fetch('jerseys.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.all = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Failed to load jerseys.json:', err);
      state.all = [];
      grid.innerHTML = `
        <div class="empty">
          <div class="empty-icon">⚠</div>
          <p>Could not load jerseys.json.</p>
          <p style="font-size:.75rem;margin-top:.5rem">
            Run the importer first: <code>npm run import -- --album &lt;yupoo-album-url&gt;</code>
          </p>
        </div>`;
    }
    render();
  }

  // ── 3. FILTERING / SORTING ────────────────────────────────────────────
  function getFiltered() {
    let d = [...state.all];

    if (state.category !== 'all') d = d.filter((j) => j.category === state.category);
    if (state.type !== 'all') d = d.filter((j) => j.type === state.type);
    if (state.region !== 'all') d = d.filter((j) => j.region === state.region);

    if (state.search) {
      const q = state.search.toLowerCase();
      d = d.filter((j) =>
        (j.title || '').toLowerCase().includes(q) ||
        (j.team || '').toLowerCase().includes(q) ||
        (j.season || '').toLowerCase().includes(q)
      );
    }

    if (state.sort === 'az') d.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    if (state.sort === 'za') d.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    if (state.sort === 'season') d.sort((a, b) => (b.season || '').localeCompare(a.season || ''));

    return d;
  }

  // ── 4. LAZY LOADING ───────────────────────────────────────────────────
  let observer = null;
  function getObserver() {
    if (observer) return observer;
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const img = entry.target;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        });
      },
      { rootMargin: '200px 0px' } // start loading slightly before entering viewport
    );
    return observer;
  }

  function handleImgLoaded(img, skeleton) {
    img.classList.add('loaded');
    if (skeleton) skeleton.classList.add('hidden');
  }

  // ── GRID RENDERING ────────────────────────────────────────────────────
  function render() {
    const data = getFiltered();

    resultCount.textContent = `${data.length} kit${data.length !== 1 ? 's' : ''} found`;
    headerCount.textContent = `${data.length} / ${state.all.length} kits`;

    if (!data.length) {
      grid.innerHTML = `
        <div class="empty">
          <div class="empty-icon">👕</div>
          <p>No jerseys match your filters.</p>
        </div>`;
      return;
    }

    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    data.forEach((jersey, i) => {
      frag.appendChild(buildCard(jersey, i));
    });

    grid.appendChild(frag);

    // Wire up lazy-loading + click handlers after elements are in the DOM
    const obs = getObserver();
    grid.querySelectorAll('.lazy-img').forEach((img) => obs.observe(img));

    grid.querySelectorAll('.card').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.idx);
        openModal(data[idx], data);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const idx = Number(card.dataset.idx);
          openModal(data[idx], data);
        }
      });
    });
  }

  function buildCard(jersey, idx) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.idx = String(idx);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View ${jersey.title}`);
    card.style.animationDelay = `${Math.min(idx, 24) * 0.025}s`;

    const coverSrc = jersey.images && jersey.images[0] ? jersey.images[0] : null;
    const imgCount = jersey.images ? jersey.images.length : 0;

    const badge = jersey.type === 'player'
      ? '<span class="cbadge">Player Ver.</span>'
      : jersey.type === 'special'
        ? '<span class="cbadge special">Special</span>'
        : '';

    const dispTags = (jersey.kitTagsForDisplay || deriveDisplayTags(jersey));

    card.innerHTML = `
      <div class="card-img-wrap">
        <div class="img-skeleton"></div>
        ${coverSrc
          ? `<img class="lazy-img" data-src="${escapeAttr(coverSrc)}" alt="${escapeAttr(jersey.title)}"/>`
          : `<div class="no-image">${escapeHtml(initials(jersey.team || jersey.title))}</div>`}
        <div class="view-btn">View Photos</div>
        ${imgCount > 1 ? `<span class="cbadge count">${imgCount} photos</span>` : ''}
        ${badge}
      </div>
      <div class="card-body">
        <div class="card-team">${escapeHtml(jersey.team || jersey.title)}</div>
        <div class="card-detail">${escapeHtml(jersey.title)}</div>
        <div class="tags">${dispTags.map((t) => `<span class="tag ${t}">${tagLabel(t)}</span>`).join('')}</div>
      </div>`;

    // Wire the loaded/error handlers on the lazy <img> we just created
    const imgEl = card.querySelector('.lazy-img');
    const skeletonEl = card.querySelector('.img-skeleton');
    if (imgEl) {
      imgEl.addEventListener('load', () => handleImgLoaded(imgEl, skeletonEl));
      imgEl.addEventListener('error', () => {
        skeletonEl.classList.add('hidden');
        imgEl.replaceWith(Object.assign(document.createElement('div'), {
          className: 'no-image',
          textContent: initials(jersey.team || jersey.title),
        }));
      });
    } else {
      skeletonEl.classList.add('hidden');
    }

    return card;
  }

  function deriveDisplayTags(jersey) {
    const tags = [];
    if (jersey.type) tags.push(jersey.type);
    return tags;
  }

  function initials(str) {
    return (str || '?')
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  // ── 5. GALLERY MODAL ──────────────────────────────────────────────────
  const overlay = document.getElementById('overlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalSub = document.getElementById('modalSub');
  const modalClose = document.getElementById('modalClose');
  const modalImg = document.getElementById('modalImg');
  const modalThumbs = document.getElementById('modalThumbs');
  const modalCounter = document.getElementById('modalCounter');
  const modalTags = document.getElementById('modalTags');
  const navPrev = document.getElementById('navPrev');
  const navNext = document.getElementById('navNext');

  let modalJersey = null;
  let modalIdx = 0;
  let lastFocusedEl = null;

  function openModal(jersey) {
    modalJersey = jersey;
    modalIdx = 0;
    lastFocusedEl = document.activeElement;

    modalTitle.textContent = jersey.team || jersey.title;
    modalSub.textContent = jersey.title;

    const dispTags = deriveDisplayTags(jersey);
    modalTags.innerHTML = dispTags.map((t) => `<span class="tag ${t}">${tagLabel(t)}</span>`).join('');

    buildThumbs(jersey);
    showImage(0);

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    modalImg.removeAttribute('src');
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  function buildThumbs(jersey) {
    const images = jersey.images || [];
    if (images.length <= 1) {
      modalThumbs.innerHTML = '';
      modalThumbs.style.display = 'none';
      return;
    }
    modalThumbs.style.display = 'flex';
    modalThumbs.innerHTML = images
      .map((src, i) => `<img class="thumb${i === 0 ? ' active' : ''}" src="${escapeAttr(src)}" data-i="${i}" alt="View ${i + 1}" tabindex="0"/>`)
      .join('');

    modalThumbs.querySelectorAll('.thumb').forEach((t) => {
      t.addEventListener('click', () => showImage(Number(t.dataset.i)));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showImage(Number(t.dataset.i));
        }
      });
    });
  }

  function showImage(i) {
    const images = (modalJersey && modalJersey.images) || [];
    if (!images.length) {
      modalImg.removeAttribute('src');
      modalCounter.textContent = '0 / 0';
      navPrev.disabled = true;
      navNext.disabled = true;
      return;
    }

    modalIdx = ((i % images.length) + images.length) % images.length;

    modalImg.classList.add('loading');
    const img = new Image();
    img.onload = () => {
      modalImg.src = img.src;
      modalImg.classList.remove('loading');
    };
    img.onerror = () => {
      modalImg.classList.remove('loading');
    };
    img.src = images[modalIdx];

    modalCounter.textContent = `${modalIdx + 1} / ${images.length}`;
    modalThumbs.querySelectorAll('.thumb').forEach((t, idx) => {
      t.classList.toggle('active', idx === modalIdx);
      if (idx === modalIdx) t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    navPrev.disabled = images.length <= 1;
    navNext.disabled = images.length <= 1;
  }

  modalClose.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  navPrev.addEventListener('click', () => showImage(modalIdx - 1));
  navNext.addEventListener('click', () => showImage(modalIdx + 1));

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') showImage(modalIdx - 1);
    if (e.key === 'ArrowRight') showImage(modalIdx + 1);
  });

  // Basic touch swipe support for mobile gallery navigation
  let touchStartX = null;
  const modalMain = document.getElementById('modalMain');
  modalMain.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  modalMain.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      if (dx > 0) showImage(modalIdx - 1); else showImage(modalIdx + 1);
    }
    touchStartX = null;
  }, { passive: true });

  // ── 6. FILTER / SEARCH / SORT EVENTS ──────────────────────────────────
  document.querySelectorAll('.pills').forEach((group) => {
    const filterKey = group.dataset.filter;
    group.querySelectorAll('.pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        state[filterKey] = btn.dataset.value;
        group.querySelectorAll('.pill').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        render();
      });
    });
  });

  let searchDebounce;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.search = e.target.value.trim();
      render();
    }, 120);
  });

  sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  // ── INIT ──────────────────────────────────────────────────────────────
  loadJerseys();
})();
