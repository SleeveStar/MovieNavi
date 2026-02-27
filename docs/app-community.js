const state = {
  period: "today",
  page: 0,
  size: 20,
  query: ""
};

const topActionsEl = document.querySelector(".community-top-actions");
const accountLinkEl = document.querySelector("#account-link");
const quickLoginPanelEl = document.querySelector("#community-quick-login-panel");
const quickLoginFormEl = document.querySelector("#community-quick-login-form");
const quickLoginEmailEl = document.querySelector("#community-quick-login-email");
const quickLoginPasswordEl = document.querySelector("#community-quick-login-password");
const quickLoginRememberEl = document.querySelector("#community-quick-login-remember");
const favoritesEl = document.querySelector("#community-favorites");
const accordionEl = document.querySelector("#community-category-accordion");
const popularBoardsEl = document.querySelector("#community-popular-boards");
const realtimeHotEl = document.querySelector("#community-realtime-hot");
const hotTagsEl = document.querySelector("#community-hot-tags");
const noticesEl = document.querySelector("#community-notices");
const searchFormEl = document.querySelector("#community-global-search");
const searchInputEl = document.querySelector("#community-search-input");

init();

async function init() {
  hydrateRememberedEmail();
  bindEvents();
  await hydrateAccountArea();
  await loadDashboard();
  startRealtimeAutoRefresh();
}

function bindEvents() {
  document.querySelectorAll(".community-tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      const nextPeriod = tab.dataset.period;
      if (!nextPeriod || nextPeriod === state.period) return;
      state.period = nextPeriod;
      state.page = 0;
      document.querySelectorAll(".community-tab").forEach((node) => {
        node.classList.toggle("is-active", node === tab);
      });
      await loadDashboard();
    });
  });

  if (searchFormEl && searchInputEl) {
    searchFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.query = searchInputEl.value.trim();
      state.page = 0;
      await loadDashboard();
    });
  }

  if (quickLoginFormEl && quickLoginEmailEl && quickLoginPasswordEl) {
    quickLoginFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = quickLoginEmailEl.value.trim();
      const password = quickLoginPasswordEl.value;
      if (!email || !password) return;

      const response = await api("/api/auth/login", "POST", { email, password });
      if (!response.ok) {
        alert(response.data?.message || "로그인에 실패했습니다.");
        return;
      }

      persistRememberedEmail(email);

      if (typeof window !== "undefined") {
        window.__movienavi_auth_me_promise__ = null;
      }
      window.location.reload();
    });
  }
}

async function hydrateAccountArea() {
  if (!topActionsEl || !accountLinkEl || typeof window.getMovienaviAuthState !== "function") {
    return;
  }
  const auth = await window.getMovienaviAuthState().catch(() => null);
  if (!auth?.ok || !auth.data?.displayName) {
    if (quickLoginPanelEl) {
      quickLoginPanelEl.hidden = false;
    }
    return;
  }

  if (quickLoginPanelEl) {
    quickLoginPanelEl.hidden = true;
  }

  const logoutButton = topActionsEl.querySelector("#logout-btn");
  if (logoutButton) {
    logoutButton.remove();
  }
  accountLinkEl.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "community-profile";
  wrapper.innerHTML = `
    <button type="button" class="community-profile-trigger" aria-expanded="false">
      <span class="community-profile-name">${escapeHtml(auth.data.displayName)}</span>
      <span class="community-profile-caret">▾</span>
    </button>
    <div class="community-profile-menu" hidden>
      <a href="/mypage">마이페이지</a>
      <button type="button" id="community-logout-btn">로그아웃</button>
    </div>
  `;
  topActionsEl.appendChild(wrapper);

  const trigger = wrapper.querySelector(".community-profile-trigger");
  const menu = wrapper.querySelector(".community-profile-menu");
  const logoutBtn = wrapper.querySelector("#community-logout-btn");

  trigger?.addEventListener("click", () => {
    const isOpen = !menu.hidden;
    menu.hidden = isOpen;
    trigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      window.location.href = "/home";
    }
  });

  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) {
      menu.hidden = true;
      trigger?.setAttribute("aria-expanded", "false");
    }
  });
}

async function loadDashboard() {
  const params = new URLSearchParams({
    period: state.period,
    page: String(state.page),
    size: String(state.size)
  });
  if (state.query) {
    params.set("q", state.query);
  }

  const response = await api(`/api/community/dashboard?${params.toString()}`);
  if (!response.ok || !response.data) {
    renderError();
    return;
  }
  renderDashboard(response.data);
}

function renderError() {
  const message = "<div class='state-chip state-error'>커뮤니티 데이터를 불러오지 못했습니다.</div>";
  favoritesEl.innerHTML = message;
  accordionEl.innerHTML = message;
  popularBoardsEl.innerHTML = "<li class='muted'>인기 게시판 데이터가 없습니다.</li>";
  realtimeHotEl.innerHTML = "<li class='muted'>데이터를 불러오지 못했습니다.</li>";
  hotTagsEl.innerHTML = message;
  noticesEl.innerHTML = "<li class='muted'>데이터를 불러오지 못했습니다.</li>";
}

function renderDashboard(data) {
  const loggedIn = Boolean(data.loggedIn);
  renderFavorites(Array.isArray(data.favoriteBoards) ? data.favoriteBoards : [], loggedIn);
  renderCategories(Array.isArray(data.categories) ? data.categories : [], loggedIn);
  renderPopularBoards(Array.isArray(data.popularBoards) ? data.popularBoards : [], loggedIn);
  renderRealtimeHot(Array.isArray(data.realtimeHotPosts) ? data.realtimeHotPosts : []);
  renderHotTags(Array.isArray(data.hotTags) ? data.hotTags : []);
  renderNotices(Array.isArray(data.notices) ? data.notices : []);
}

function startRealtimeAutoRefresh() {
  window.setInterval(async () => {
    const params = new URLSearchParams({
      period: state.period,
      page: String(state.page),
      size: String(state.size)
    });
    if (state.query) {
      params.set("q", state.query);
    }
    const response = await api(`/api/community/dashboard?${params.toString()}`);
    if (!response.ok || !response.data) return;
    renderRealtimeHot(Array.isArray(response.data.realtimeHotPosts) ? response.data.realtimeHotPosts : []);
    renderHotTags(Array.isArray(response.data.hotTags) ? response.data.hotTags : []);
    renderNotices(Array.isArray(response.data.notices) ? response.data.notices : []);
  }, 60 * 60 * 1000);
}

function renderFavorites(boards, loggedIn) {
  if (!boards.length) {
    favoritesEl.innerHTML = loggedIn
      ? "<p class='muted'>핀한 게시판이 없습니다.</p>"
      : "<p class='muted'>로그인하면 즐겨찾기 게시판을 고정할 수 있어요.</p>";
    return;
  }

  favoritesEl.innerHTML = boards
    .map(
      (board) => `
        <a class="community-favorite-item" href="/community/board?code=${encodeURIComponent(board.code)}">
          <strong>${escapeHtml(board.name)}</strong>
          <span>📌 고정됨</span>
        </a>
      `
    )
    .join("");
}

function renderCategories(groups, loggedIn) {
  if (!groups.length) {
    accordionEl.innerHTML = "<p class='muted'>카테고리가 없습니다.</p>";
    return;
  }

  accordionEl.innerHTML = groups
    .map((group, index) => {
      const rows = (group.boards || [])
        .map((board) => {
          const pinButton = loggedIn
            ? `<button type="button" class="community-pin-btn ${board.favorite ? "is-pinned" : ""}" data-board-code="${escapeHtml(board.code)}" aria-label="즐겨찾기 토글">📌</button>`
            : "";
          return `
            <li>
              <a href="/community/board?code=${encodeURIComponent(board.code)}">${escapeHtml(board.name)}</a>
              ${pinButton}
            </li>
          `;
        })
        .join("");

      return `
        <details class="community-accordion-item" ${index === 0 ? "open" : ""}>
          <summary>${escapeHtml(group.groupName || "카테고리")}</summary>
          <ul>${rows || "<li class='muted'>게시판 없음</li>"}</ul>
        </details>
      `;
    })
    .join("");

  accordionEl.querySelectorAll(".community-pin-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const boardCode = button.dataset.boardCode;
      if (!boardCode) return;

      const response = await api(`/api/community/favorites/${encodeURIComponent(boardCode)}/toggle`, "POST");
      if (!response.ok) {
        alert(response.data?.message || "즐겨찾기 변경에 실패했습니다.");
        return;
      }
      await loadDashboard();
    });
  });
}

function renderPopularBoards(boards, loggedIn) {
  if (!boards.length) {
    popularBoardsEl.innerHTML = "<li class='muted'>인기 게시판 데이터가 없습니다.</li>";
    return;
  }

  popularBoardsEl.innerHTML = boards
    .slice(0, 10)
    .map((board) => {
      const pin = loggedIn && board.favorite ? "<span class='community-popular-pin'>📌</span>" : "";
      return `
        <li>
          <a href="/community/board?code=${encodeURIComponent(board.code)}">
            <div class="community-popular-title-row">
              <strong>${escapeHtml(board.name)}</strong>
              ${pin}
            </div>
            <p>${escapeHtml(board.description || "")}</p>
            <span>오늘 글 ${Number(board.todayPostCount || 0)}개</span>
          </a>
        </li>
      `;
    })
    .join("");
}

function renderRealtimeHot(rows) {
  if (!rows.length) {
    realtimeHotEl.innerHTML = "<li class='muted'>데이터가 없습니다.</li>";
    return;
  }

  realtimeHotEl.innerHTML = rows
    .map(
      (row) => `
        <li>
          <a href="/community/post?id=${Number(row.postId)}">
            <strong>${Number(row.rank)}.</strong>
            ${row.thumbnailUrl ? `<img class="community-hot-thumb" src="${escapeHtml(row.thumbnailUrl)}" alt="${escapeHtml(row.title || "썸네일")}" loading="lazy" />` : `<span class="community-hot-thumb community-hot-thumb-empty">🎬</span>`}
            <span>${escapeHtml(row.title || "제목 없음")}</span>
          </a>
        </li>
      `
    )
    .join("");
}

function renderHotTags(tags) {
  if (!tags.length) {
    hotTagsEl.innerHTML = "<p class='muted'>태그 데이터가 없습니다.</p>";
    return;
  }

  hotTagsEl.innerHTML = tags
    .map((tag) => `<span class="community-tag" title="언급 ${Number(tag.count || 0)}회">#${escapeHtml(tag.tag || "")}</span>`)
    .join("");
}

function renderNotices(noticeRows) {
  if (!noticeRows.length) {
    noticesEl.innerHTML = "<li class='muted'>공지 없음</li>";
    return;
  }

  noticesEl.innerHTML = noticeRows
    .map(
      (notice) => `
        <li>
          <a href="/community/post?id=${Number(notice.postId)}">${escapeHtml(notice.title || "제목 없음")}</a>
          <time>${formatRelativeTime(notice.createdAt)}</time>
        </li>
      `
    )
    .join("");
}

function formatRelativeTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const diffMinute = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMinute < 1) return "방금";
  if (diffMinute < 60) return `${diffMinute}분 전`;
  const diffHour = Math.floor(diffMinute / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

async function api(url, method = "GET", body) {
  const options = {
    method,
    credentials: "include",
    headers: {}
  };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hydrateRememberedEmail() {
  if (!quickLoginEmailEl || !quickLoginRememberEl) return;
  try {
    const saved = localStorage.getItem("movienavi_remember_email") || "";
    if (!saved) return;
    quickLoginEmailEl.value = saved;
    quickLoginRememberEl.checked = true;
  } catch {
    // no-op
  }
}

function persistRememberedEmail(email) {
  if (!quickLoginRememberEl) return;
  try {
    if (quickLoginRememberEl.checked) {
      localStorage.setItem("movienavi_remember_email", email);
    } else {
      localStorage.removeItem("movienavi_remember_email");
    }
  } catch {
    // no-op
  }
}
