const boardTitleEl = document.querySelector("#community-board-title");
const writeLinkEl = document.querySelector("#community-write-link");
const feedbackEl = document.querySelector("#community-board-feedback");
const listEl = document.querySelector("#community-post-list");
const paginationEl = document.querySelector("#community-board-pagination");

const state = {
  boardCode: "",
  page: 0,
  size: 20,
  totalPages: 0
};

bootstrap();

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get("code") || "").trim();
  if (!code) {
    feedbackEl.innerHTML = "<div class='state-chip state-error'>게시판 코드가 없습니다.</div>";
    return;
  }

  state.boardCode = code;
  writeLinkEl.href = `/community/write?board=${encodeURIComponent(code)}`;
  await load();
}

async function load() {
  const response = await api(`/api/community/boards/${encodeURIComponent(state.boardCode)}/posts?page=${state.page}&size=${state.size}`);
  if (!response.ok || !response.data) {
    feedbackEl.innerHTML = "<div class='state-chip state-error'>게시글을 불러오지 못했습니다.</div>";
    return;
  }

  const page = response.data;
  boardTitleEl.textContent = page.boardName || "게시판";
  feedbackEl.innerHTML = `<div class='state-chip state-ok'>총 ${Number(page.totalElements || 0)}개</div>`;

  const items = Array.isArray(page.items) ? page.items : [];
  listEl.innerHTML = "";
  if (!items.length) {
    listEl.innerHTML = "<li class='muted'>아직 게시글이 없습니다.</li>";
  } else {
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "community-post-item";
      li.innerHTML = `
        <a class="community-post-link" href="/community/post?id=${Number(item.id)}">
          <strong>${escapeHtml(item.title || "제목 없음")}</strong>
        </a>
        <div class="community-post-meta">
          <span>${escapeHtml(item.authorDisplayName || "익명")}</span>
          <span>조회 ${Number(item.viewCount || 0)}</span>
          <span>댓글 ${Number(item.commentCount || 0)}</span>
          <span>${formatDate(item.createdAt)}</span>
        </div>
      `;
      listEl.appendChild(li);
    });
  }

  state.totalPages = Number(page.totalPages || 0);
  state.page = Number(page.page || 0);
  renderPagination(Number(page.totalElements || 0));
}

function renderPagination(totalElements) {
  if (!paginationEl) return;
  if (!totalElements) {
    paginationEl.innerHTML = "";
    return;
  }

  const current = state.page + 1;
  const total = Math.max(state.totalPages, 1);

  paginationEl.innerHTML = `
    <button type="button" class="page-btn" ${state.page <= 0 ? "disabled" : ""} data-page-action="prev">이전</button>
    <span class="page-status">${current} / ${total}</span>
    <button type="button" class="page-btn" ${state.page >= total - 1 ? "disabled" : ""} data-page-action="next">다음</button>
  `;

  paginationEl.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.pageAction;
      if (action === "prev" && state.page > 0) {
        state.page -= 1;
      } else if (action === "next" && state.page < total - 1) {
        state.page += 1;
      } else {
        return;
      }
      await load();
    });
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
