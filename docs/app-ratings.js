const ratingListEl = document.querySelector("#rating-list");

bootstrap();

async function bootstrap() {
  const me = await api("/api/auth/me");
  if (!me.ok) {
    ratingListEl.innerHTML =
      `
      <li class="auth-required-item">
        <p class="muted">로그인이 필요합니다.</p>
        <div class="auth-required-actions">
          <a class="light-action-btn" href="./login.html">로그인</a>
          <a class="light-action-btn" href="./signup.html">회원가입</a>
        </div>
      </li>
      `;
    return;
  }
  await renderRatingList();
}

async function renderRatingList() {
  const response = await api("/api/ratings");
  if (!response.ok) {
    ratingListEl.innerHTML = "<li class='muted'>평가 목록을 불러오지 못했습니다.</li>";
    return;
  }

  const items = response.data || [];
  ratingListEl.innerHTML = "";
  if (!items.length) {
    ratingListEl.innerHTML = "<li class='muted'>아직 평가한 영화가 없습니다.</li>";
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${escapeHtml(item.title)} (${item.rating}★)</span>
      <button class="link-btn">삭제</button>
    `;
    li.querySelector("button").addEventListener("click", async () => {
      await api(`/api/ratings/${item.movieId}`, "DELETE");
      await renderRatingList();
    });
    ratingListEl.appendChild(li);
  });
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

