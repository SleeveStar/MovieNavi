const meSummaryEl = document.querySelector("#me-summary");
const statCountEl = document.querySelector("#stat-count");
const statAvgEl = document.querySelector("#stat-avg");
const logoutBtn = document.querySelector("#logout-btn");

logoutBtn.addEventListener("click", async () => {
  await api("/api/auth/logout", "POST");
  window.location.href = "./login.html";
});

bootstrap();

async function bootstrap() {
  const me = await api("/api/auth/me");
  if (!(me.ok && me.data?.displayName)) {
    meSummaryEl.textContent = "로그인이 필요합니다. 로그인 페이지로 이동합니다.";
    setTimeout(() => {
      window.location.href = "./login.html";
    }, 800);
    return;
  }

  meSummaryEl.textContent = `이메일: ${me.data.email}\n닉네임: ${me.data.displayName}`;

  const ratings = await api("/api/ratings");
  const items = ratings.ok && Array.isArray(ratings.data) ? ratings.data : [];
  const count = items.length;
  const avg = count
    ? (items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / count).toFixed(2)
    : "0.00";

  statCountEl.textContent = String(count);
  statAvgEl.textContent = `${avg}★`;
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

