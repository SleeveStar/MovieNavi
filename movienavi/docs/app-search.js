const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const TOKEN_STORAGE_KEY = "movienavi_tmdb_token";

const state = {
  token: resolveToken(),
  language: resolveConfig("LANGUAGE", "ko-KR"),
  region: resolveConfig("REGION", "KR"),
  genreMap: {},
  ratings: {},
  rawResults: []
};

const detailModal = document.querySelector("#detail-modal");
const detailContent = document.querySelector("#detail-content");
const searchInputEl = document.querySelector("#search-input");
const searchFeedbackEl = document.querySelector("#search-feedback");
const searchResultsEl = document.querySelector("#search-results");
const sortFilterEl = document.querySelector("#filter-sort");
const genreFilterEl = document.querySelector("#filter-genre");
const yearFilterEl = document.querySelector("#filter-year");

document.querySelector("#search-form").addEventListener("submit", onSearchSubmit);
document.querySelector("#close-detail-modal").addEventListener("click", () => detailModal.close());
[sortFilterEl, genreFilterEl, yearFilterEl].forEach((el) => el.addEventListener("change", applyFilters));

bootstrap();

async function bootstrap() {
  try {
    if (!state.token || state.token.includes("PASTE_YOUR_TMDB")) {
      const entered = window.prompt("TMDB Read Access Token을 입력하세요.");
      if (!entered) return;
      state.token = entered.trim();
      localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
    }

    renderState(searchFeedbackEl, "empty", "검색어를 입력하면 결과를 보여드립니다.");
    await Promise.all([loadGenres(), loadRatingsFromApi()]);
    populateGenreFilter();
    populateYearFilter();

    const query = new URLSearchParams(window.location.search).get("q");
    if (query) {
      searchInputEl.value = query;
      await search(query);
    }
  } catch (error) {
    console.error(error);
    renderState(searchFeedbackEl, "error", "검색 페이지 초기화 실패");
  }
}

function resolveConfig(key, fallback) {
  if (window.MOVIENAVI_CONFIG && window.MOVIENAVI_CONFIG[key]) return window.MOVIENAVI_CONFIG[key];
  return fallback;
}

function resolveToken() {
  if (window.MOVIENAVI_CONFIG && window.MOVIENAVI_CONFIG.TMDB_ACCESS_TOKEN) {
    return window.MOVIENAVI_CONFIG.TMDB_ACCESS_TOKEN;
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  const merged = { language: state.language, region: state.region, ...params };
  Object.entries(merged).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
  return response.json();
}

async function api(url) {
  const response = await fetch(url, { credentials: "include" });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
}

async function loadRatingsFromApi() {
  const response = await api("/api/ratings");
  if (!response.ok || !Array.isArray(response.data)) {
    state.ratings = {};
    return;
  }
  state.ratings = response.data.reduce((acc, item) => {
    acc[item.movieId] = item;
    return acc;
  }, {});
}

async function loadGenres() {
  const data = await tmdb("/genre/movie/list");
  state.genreMap = (data.genres || []).reduce((acc, genre) => {
    acc[genre.id] = genre.name;
    return acc;
  }, {});
}

function populateGenreFilter() {
  Object.entries(state.genreMap).forEach(([id, name]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = name;
    genreFilterEl.appendChild(option);
  });
}

function populateYearFilter() {
  const now = new Date().getFullYear();
  for (let year = now; year >= 1950; year -= 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = `${year}년`;
    yearFilterEl.appendChild(option);
  }
}

async function onSearchSubmit(event) {
  event.preventDefault();
  const query = searchInputEl.value.trim();
  if (!query) return;
  await search(query);
  history.replaceState(null, "", `./search.html?q=${encodeURIComponent(query)}`);
}

async function search(query) {
  renderSkeleton(searchResultsEl, 10);
  renderState(searchFeedbackEl, "loading", "검색 중...");
  const data = await tmdb("/search/movie", { query, include_adult: false, page: 1 });
  state.rawResults = data.results || [];
  applyFilters();
}

function applyFilters() {
  let movies = state.rawResults.slice();
  const sort = sortFilterEl.value;
  const genre = genreFilterEl.value;
  const year = yearFilterEl.value;

  if (genre) movies = movies.filter((movie) => (movie.genre_ids || []).includes(Number(genre)));
  if (year) movies = movies.filter((movie) => String(movie.release_date || "").startsWith(year));

  movies.sort((a, b) => {
    if (sort === "rating") return (b.vote_average || 0) - (a.vote_average || 0);
    if (sort === "latest") return String(b.release_date || "").localeCompare(String(a.release_date || ""));
    return (b.popularity || 0) - (a.popularity || 0);
  });

  if (!movies.length) {
    searchResultsEl.innerHTML = "";
    renderState(searchFeedbackEl, "empty", "조건에 맞는 결과가 없습니다.");
    return;
  }

  renderState(searchFeedbackEl, "ok", `${movies.length}개의 결과`);
  searchResultsEl.innerHTML = "";
  movies.slice(0, 24).forEach((movie) => searchResultsEl.appendChild(createMovieCard(movie)));
}

function createMovieCard(movie) {
  const card = document.createElement("article");
  card.className = "movie-card";
  const userRating = state.ratings[movie.id]?.rating || 0;
  const year = movie.release_date ? movie.release_date.slice(0, 4) : "미정";
  card.innerHTML = `
    <img src="${movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : ""}" alt="${escapeHtml(movie.title || "")}" />
    <div class="movie-meta">
      <h3 class="movie-title">${escapeHtml(movie.title || "제목 없음")}</h3>
      <p class="movie-sub">${year} · TMDB ${Number(movie.vote_average || 0).toFixed(1)}</p>
      <p class="movie-sub">내 평가 ${userRating ? `${userRating}★` : "없음"}</p>
      <button class="detail-btn" type="button">상세 보기</button>
    </div>
  `;
  card.querySelector(".detail-btn").addEventListener("click", async () => openMovieDetail(movie.id));
  return card;
}

function renderSkeleton(container, count) {
  container.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const skeleton = document.createElement("article");
    skeleton.className = "movie-card skeleton-card";
    skeleton.innerHTML = `
      <div class="skeleton-poster"></div>
      <div class="movie-meta">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
    container.appendChild(skeleton);
  }
}

function renderState(target, type, message) {
  target.innerHTML = `<div class="state-chip state-${type}">${escapeHtml(message)}</div>`;
}

async function openMovieDetail(movieId) {
  try {
    detailContent.innerHTML = `<div class="state-chip state-loading">상세 로딩 중...</div>`;
    detailModal.showModal();
    const [data, providerData] = await Promise.all([
      tmdb(`/movie/${movieId}`, { append_to_response: "credits,recommendations" }),
      tmdb(`/movie/${movieId}/watch/providers`)
    ]);
    const cast = (data.credits?.cast || []).slice(0, 10);
    const genreIds = (data.genres || []).map((genre) => genre.id);
    const genreBased = await loadGenreBasedRecommendations(movieId, genreIds);
    const providerText = formatProviders(providerData, state.region);
    const backdropUrl = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : "";
    const posterUrl = data.poster_path ? `${IMAGE_BASE_URL}${data.poster_path}` : "";
    detailContent.innerHTML = `
      <section class="detail-media">
        ${
          backdropUrl
            ? `<img class="detail-backdrop" src="${backdropUrl}" alt="${escapeHtml(data.title || "영화")} 배경 이미지" />`
            : ""
        }
        ${
          posterUrl
            ? `<img class="detail-poster" src="${posterUrl}" alt="${escapeHtml(data.title || "영화")} 포스터" />`
            : ""
        }
      </section>
      <header class="detail-header">
        <h3>${escapeHtml(data.title || "제목 없음")}</h3>
        <p class="detail-summary">TMDB ${Number(data.vote_average || 0).toFixed(1)} · ${data.runtime || "-"}분 · ${
          data.release_date || "개봉일 미정"
        }</p>
      </header>
      <p class="detail-overview">${escapeHtml((data.overview || "줄거리 정보가 없습니다.").slice(0, 240))}</p>
      <p class="detail-overview"><strong>시청 가능 플랫폼:</strong> ${escapeHtml(providerText)}</p>
      <div class="detail-tabs">
        <button type="button" class="detail-tab active" data-tab="cast">출연</button>
        <button type="button" class="detail-tab" data-tab="reco">유사 장르 추천</button>
      </div>
      <section class="detail-panel" data-panel="cast">
        ${cast.length ? cast.map((c) => `<span class="chip">${escapeHtml(c.name)}</span>`).join("") : "<p class='muted'>출연 정보 없음</p>"}
      </section>
      <section class="detail-panel hidden" data-panel="reco">
        ${
          genreBased.length
            ? genreBased
                .map(
                  (movie) =>
                    `<button type="button" class="chip reco-chip" data-movie-id="${movie.id}">${escapeHtml(movie.title || "제목 없음")}</button>`
                )
                .join("")
            : "<p class='muted'>유사 장르 추천 정보 없음</p>"
        }
      </section>
    `;
    detailContent.querySelectorAll(".detail-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        detailContent.querySelectorAll(".detail-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.tab;
        detailContent.querySelectorAll(".detail-panel").forEach((panel) => {
          panel.classList.toggle("hidden", panel.dataset.panel !== target);
        });
      });
    });
    detailContent.querySelectorAll(".reco-chip").forEach((btn) => {
      btn.addEventListener("click", async () => openMovieDetail(Number(btn.dataset.movieId)));
    });
  } catch (error) {
    console.error(error);
    detailContent.innerHTML = `<div class="state-chip state-error">상세 로딩 실패</div>`;
  }
}

async function loadGenreBasedRecommendations(movieId, genreIds) {
  if (!genreIds.length) return [];
  const data = await tmdb("/discover/movie", {
    include_adult: false,
    sort_by: "popularity.desc",
    with_genres: genreIds.join(","),
    "vote_count.gte": 80,
    page: 1
  });
  return (data.results || [])
    .filter((movie) => movie.id !== movieId)
    .slice(0, 8);
}

function formatProviders(providerData, region) {
  const regionData = providerData?.results?.[region] || providerData?.results?.US;
  if (!regionData) return "정보 없음";
  const names = [...(regionData.flatrate || []), ...(regionData.rent || []), ...(regionData.buy || [])]
    .map((provider) => provider.provider_name)
    .filter(Boolean);
  const unique = names.filter((name, idx, arr) => arr.indexOf(name) === idx);
  return unique.length ? unique.join(", ") : "정보 없음";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
