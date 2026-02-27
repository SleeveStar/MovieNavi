const ratingListEl = document.querySelector("#rating-list");
const paginationEl = document.querySelector("#rating-pagination");
const ratingInsightEl = document.querySelector("#rating-insight");
const genreWatchChartEl = document.querySelector("#genre-watch-chart");
const genreLikeListEl = document.querySelector("#genre-like-list");
const nextEvalListEl = document.querySelector("#next-eval-list");
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_TOKEN_STORAGE_KEY = "movienavi_tmdb_token";

const GENRE_NAME_MAP = {
  28: "액션",
  12: "모험",
  16: "애니메이션",
  35: "코미디",
  80: "범죄",
  99: "다큐멘터리",
  18: "드라마",
  10751: "가족",
  14: "판타지",
  36: "역사",
  27: "공포",
  10402: "음악",
  9648: "미스터리",
  10749: "로맨스",
  878: "SF",
  10770: "TV 영화",
  53: "스릴러",
  10752: "전쟁",
  37: "서부"
};

const state = {
  token: resolveToken(),
  language: resolveConfig("LANGUAGE", "ko-KR"),
  region: resolveConfig("REGION", "KR"),
  page: 0,
  size: 20,
  totalPages: 0,
  totalElements: 0,
  allItems: []
};

bootstrap();

async function bootstrap() {
  const me = await api("/api/auth/me");
  if (!(me.ok && me.data?.displayName)) {
    redirectToLogin();
    return;
  }
  await loadAnalyticsData();
  await renderRatingList();
}

function redirectToLogin() {
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.href = `/login?next=${next}`;
}

async function loadAnalyticsData() {
  const response = await api("/api/ratings");
  if (!response.ok || !Array.isArray(response.data)) {
    state.allItems = [];
    renderAnalytics([]);
    return;
  }
  state.allItems = response.data;
  renderAnalytics(state.allItems);
  await renderNextEvalRecommendations(state.allItems);
}

async function renderRatingList() {
  const response = await api(`/api/ratings/page?page=${state.page}&size=${state.size}`);
  if (!response.ok) {
    ratingListEl.innerHTML = "<li class='muted'>평가 목록을 불러오지 못했습니다.</li>";
    if (paginationEl) paginationEl.innerHTML = "";
    return;
  }

  const pageData = response.data || {};
  const items = Array.isArray(pageData.items) ? pageData.items : [];
  state.totalPages = Number(pageData.totalPages || 0);
  state.totalElements = Number(pageData.totalElements || 0);
  state.page = Number(pageData.page || 0);

  ratingListEl.innerHTML = "";
  if (!items.length) {
    ratingListEl.innerHTML = "<li class='muted'>아직 평가한 영화가 없습니다.</li>";
    renderPagination();
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const ratingMarkup = buildInlineRatingMarkup(item.rating);
    const reviewText = (item.reviewText || "").trim();
    li.innerHTML = `
      <div class="rating-item-main">
        <div class="rating-item-title-row">
          <span class="rating-item-title">${escapeHtml(item.title)}</span>
        </div>
        <div class="rating-item-score-row">${ratingMarkup}</div>
        <p class="rating-item-review"><span class="rating-item-review-label">한줄평</span>${escapeHtml(reviewText || "한줄평이 없습니다.")}</p>
      </div>
      <button class="link-btn">삭제</button>
    `;
    li.querySelector("button").addEventListener("click", async () => {
      await api(`/api/ratings/${item.movieId}`, "DELETE");
      if (state.page > 0 && ratingListEl.children.length === 1) {
        state.page -= 1;
      }
      await loadAnalyticsData();
      await renderRatingList();
    });
    ratingListEl.appendChild(li);
  });

  renderPagination();
}

function renderPagination() {
  if (!paginationEl) return;
  if (!state.totalElements) {
    paginationEl.innerHTML = "";
    return;
  }

  const current = state.page + 1;
  const total = Math.max(state.totalPages, 1);

  paginationEl.innerHTML = `
    <button type="button" class="page-btn" ${state.page <= 0 ? "disabled" : ""} data-page-action="prev">이전</button>
    <span class="page-status">${current} / ${total} · 총 ${state.totalElements}개</span>
    <button type="button" class="page-btn" ${state.page >= total - 1 ? "disabled" : ""} data-page-action="next">다음</button>
  `;

  paginationEl.querySelectorAll(".page-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.pageAction;
      if (action === "prev" && state.page > 0) {
        state.page -= 1;
      } else if (action === "next" && state.page < total - 1) {
        state.page += 1;
      } else {
        return;
      }
      await renderRatingList();
    });
  });
}

function renderAnalytics(items) {
  if (!ratingInsightEl || !genreWatchChartEl || !genreLikeListEl) return;

  if (!items.length) {
    ratingInsightEl.textContent = "평가가 쌓이면 장르 취향 리포트를 보여드려요.";
    genreWatchChartEl.innerHTML = "<p class='muted'>데이터가 없습니다.</p>";
    genreLikeListEl.innerHTML = "<p class='muted'>데이터가 없습니다.</p>";
    if (nextEvalListEl) nextEvalListEl.innerHTML = "<p class='muted'>데이터가 없습니다.</p>";
    return;
  }

  const stats = new Map();
  let totalRating = 0;
  let ratingCount = 0;

  items.forEach((item) => {
    const rating = Number(item.rating);
    if (Number.isFinite(rating)) {
      totalRating += rating;
      ratingCount += 1;
    }

    const genreIds = Array.isArray(item.genreIds) ? item.genreIds : [];
    genreIds.forEach((genreId) => {
      const id = Number(genreId);
      const name = GENRE_NAME_MAP[id] || `기타(${id})`;
      if (!stats.has(name)) {
        stats.set(name, { count: 0, ratingSum: 0, ratingCount: 0 });
      }
      const row = stats.get(name);
      row.count += 1;
      if (Number.isFinite(rating)) {
        row.ratingSum += rating;
        row.ratingCount += 1;
      }
    });
  });

  const genreRows = Array.from(stats.entries()).map(([name, row]) => ({
    name,
    count: row.count,
    avg: row.ratingCount ? row.ratingSum / row.ratingCount : 0
  }));

  const topWatched = genreRows
    .slice()
    .sort((a, b) => b.count - a.count || b.avg - a.avg)
    .slice(0, 5);
  const maxCount = topWatched.length ? topWatched[0].count : 1;

  genreWatchChartEl.innerHTML = topWatched.length
    ? topWatched
        .map((row) => {
          const width = (row.count / maxCount) * 100;
          return `
            <div class="genre-row">
              <div class="genre-row-head">
                <strong>${escapeHtml(row.name)}</strong>
                <span>${row.count}편</span>
              </div>
              <div class="genre-bar-track"><span class="genre-bar-fill" style="width:${width}%"></span></div>
            </div>
          `;
        })
        .join("")
    : "<p class='muted'>장르 데이터가 없습니다.</p>";

  const highRated = genreRows
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, 3);
  const highRatedFallback = genreRows
    .slice()
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, 3);
  const likeRows = highRated.length ? highRated : highRatedFallback;

  genreLikeListEl.innerHTML = likeRows.length
    ? likeRows
        .map((row) => `<p><strong>${escapeHtml(row.name)}</strong> · ${row.avg.toFixed(1)}점 (${row.count}편)</p>`)
        .join("")
    : "<p class='muted'>장르 데이터가 없습니다.</p>";

  const avgAll = ratingCount ? totalRating / ratingCount : 0;
  const tone = avgAll >= 4.2 ? "후한 평점 성향" : avgAll >= 3.5 ? "균형 잡힌 평점 성향" : "엄격한 평점 성향";
  const topGenreText = topWatched.slice(0, 2).map((row) => row.name).join(", ") || "장르 데이터 부족";
  ratingInsightEl.textContent = `평균 ${avgAll.toFixed(1)}점, ${tone}. 주 시청 장르는 ${topGenreText}입니다.`;
}

async function renderNextEvalRecommendations(items) {
  if (!nextEvalListEl) return;
  if (!items.length) {
    nextEvalListEl.innerHTML = "<p class='muted'>평가 데이터가 부족합니다.</p>";
    return;
  }
  if (!state.token || state.token.includes("PASTE_YOUR_TMDB")) {
    nextEvalListEl.innerHTML = "<p class='muted'>추천 데이터를 불러오지 못했습니다.</p>";
    return;
  }

  nextEvalListEl.innerHTML = "<p class='muted'>추천 영화 불러오는 중...</p>";
  try {
    const preferredGenreIds = getPreferredGenreIds(items);
    if (!preferredGenreIds.length) {
      nextEvalListEl.innerHTML = "<p class='muted'>장르 데이터가 부족합니다.</p>";
      return;
    }

    const ratedMovieIds = new Set(items.map((item) => Number(item.movieId)).filter(Number.isFinite));
    const results = [];

    for (let page = 1; page <= 3 && results.length < 3; page += 1) {
      const data = await tmdb("/discover/movie", {
        include_adult: false,
        sort_by: "popularity.desc",
        "vote_count.gte": 120,
        with_genres: preferredGenreIds.join(","),
        page
      });
      const rows = Array.isArray(data?.results) ? data.results : [];
      rows.forEach((movie) => {
        if (results.length >= 3) return;
        if (!movie || !Number.isFinite(Number(movie.id))) return;
        if (ratedMovieIds.has(Number(movie.id))) return;
        if (results.some((x) => Number(x.id) === Number(movie.id))) return;
        results.push(movie);
      });
    }

    if (!results.length) {
      nextEvalListEl.innerHTML = "<p class='muted'>추천할 영화를 찾지 못했습니다.</p>";
      return;
    }

    nextEvalListEl.innerHTML = results
      .map((movie) => {
        const year = movie.release_date ? String(movie.release_date).slice(0, 4) : "미정";
        const score = Number(movie.vote_average || 0).toFixed(1);
        return `
          <article class="next-eval-item">
            <div class="next-eval-main">
              <strong>${escapeHtml(movie.title || "제목 없음")}</strong>
              <span>${year} · TMDB ${score}</span>
            </div>
            <a class="light-action-btn next-eval-link" href="/movie?id=${Number(movie.id)}">상세보기</a>
          </article>
        `;
      })
      .join("");
  } catch (error) {
    nextEvalListEl.innerHTML = "<p class='muted'>추천 데이터를 불러오지 못했습니다.</p>";
  }
}

function getPreferredGenreIds(items) {
  const counts = new Map();
  items.forEach((item) => {
    const genreIds = Array.isArray(item.genreIds) ? item.genreIds : [];
    genreIds.forEach((genreId) => {
      const id = Number(genreId);
      if (!Number.isFinite(id)) return;
      counts.set(id, (counts.get(id) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
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

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  const merged = {
    language: state.language,
    region: state.region,
    ...params
  };
  Object.entries(merged).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.status}`);
  }
  return response.json();
}

function resolveToken() {
  if (window.MOVIENAVI_CONFIG && window.MOVIENAVI_CONFIG.TMDB_ACCESS_TOKEN) {
    return window.MOVIENAVI_CONFIG.TMDB_ACCESS_TOKEN;
  }
  return localStorage.getItem(TMDB_TOKEN_STORAGE_KEY);
}

function resolveConfig(key, fallback) {
  if (window.MOVIENAVI_CONFIG && window.MOVIENAVI_CONFIG[key]) return window.MOVIENAVI_CONFIG[key];
  return fallback;
}

function buildInlineRatingMarkup(rating) {
  const value = Number(rating);
  const normalized = Number.isFinite(value) ? Math.min(Math.max(value, 0), 5) : 0;
  const widthPercent = (normalized / 5) * 100;
  return `
    <span class="inline-rating" aria-label="평점 ${normalized.toFixed(1)}점">
      <span class="inline-rating-stars" style="--star-fill:${widthPercent}%;">★★★★★</span>
      <span class="inline-rating-value">(${normalized.toFixed(1)})</span>
    </span>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


