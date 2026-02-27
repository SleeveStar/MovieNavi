const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const TOKEN_STORAGE_KEY = "movienavi_tmdb_token";

const state = {
  token: resolveToken(),
  language: resolveConfig("LANGUAGE", "ko-KR"),
  region: resolveConfig("REGION", "KR"),
  genreMap: {},
  ratings: {}
};

const titleEl = document.querySelector("#section-page-title");
const backLinkEl = document.querySelector("#section-page-back");
const feedbackEl = document.querySelector("#section-page-feedback");
const resultsEl = document.querySelector("#section-page-results");

bootstrap();

async function bootstrap() {
  try {
    if (!state.token || state.token.includes("PASTE_YOUR_TMDB")) {
      const entered = window.prompt("TMDB Read Access Token을 입력하세요.");
      if (!entered) return;
      state.token = entered.trim();
      localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
    }

    const params = new URLSearchParams(window.location.search);
    const query = (params.get("q") || "").trim();
    const sectionType = resolveSectionType(params.get("section"));

    if (backLinkEl) {
      backLinkEl.href = query ? `./search.html?q=${encodeURIComponent(query)}` : "./search.html";
    }

    if (!query || !sectionType) {
      renderState(feedbackEl, "empty", "요청 정보가 올바르지 않습니다. 검색 페이지로 돌아가 다시 시도해주세요.");
      resultsEl.innerHTML = "";
      return;
    }

    renderState(feedbackEl, "loading", "결과를 불러오는 중...");
    await Promise.all([loadGenres(), loadRatingsFromApi()]);

    const section = await loadSection(query, sectionType);
    if (!section || !section.movies.length) {
      const sectionLabel = section ? section.title : "선택한 섹션";
      titleEl.textContent = sectionLabel;
      renderState(feedbackEl, "empty", "표시할 결과가 없습니다.");
      resultsEl.innerHTML = "";
      return;
    }

    titleEl.textContent = section.title;
    renderState(feedbackEl, "ok", `${section.movies.length}개의 결과`);
    renderMovies(section.movies);
  } catch (error) {
    console.error(error);
    renderState(feedbackEl, "error", "섹션 결과를 불러오지 못했습니다.");
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

function resolveSectionType(value) {
  const type = String(value || "").toLowerCase();
  if (type === "title" || type === "genre" || type === "category") return type;
  return null;
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

async function loadSection(query, sectionType) {
  if (sectionType === "title") {
    const rows = await fetchPaged("/search/movie", { query, include_adult: false }, 3);
    return {
      type: "title",
      title: "제목 일치",
      movies: dedupeMovies(rows).slice(0, 60)
    };
  }

  if (sectionType === "genre") {
    const matchedGenreIds = findMatchedGenreIds(query);
    const matchedGenreNames = matchedGenreIds.map((id) => state.genreMap[id]).filter(Boolean);
    if (!matchedGenreIds.length) {
      return {
        type: "genre",
        title: "장르 추천",
        movies: []
      };
    }

    const rows = await fetchPaged(
      "/discover/movie",
      {
        include_adult: false,
        sort_by: "popularity.desc",
        with_genres: matchedGenreIds.join(",")
      },
      3
    );
    return {
      type: "genre",
      title: `장르 추천 (${matchedGenreNames.slice(0, 2).join(", ")})`,
      movies: dedupeMovies(rows).slice(0, 60)
    };
  }

  const categoryIntent = detectCategoryIntent(query);
  if (!categoryIntent) {
    return {
      type: "category",
      title: "카테고리 추천",
      movies: []
    };
  }

  const rows = await fetchPaged(categoryIntent.path, categoryIntent.params || {}, 3);
  return {
    type: "category",
    title: `카테고리 추천 (${categoryIntent.label})`,
    movies: dedupeMovies(rows).slice(0, 60)
  };
}

async function fetchPaged(path, baseParams, maxPage) {
  const pages = [];
  for (let page = 1; page <= maxPage; page += 1) {
    pages.push(page);
  }

  const responses = await Promise.all(
    pages.map((page) => tmdb(path, { ...baseParams, page }))
  );
  return responses.flatMap((data) => (Array.isArray(data?.results) ? data.results : []));
}

function findMatchedGenreIds(query) {
  const normalizedQuery = normalizeKeyword(query);
  return Object.entries(state.genreMap)
    .filter(([, name]) => {
      const normalizedName = normalizeKeyword(name);
      return normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName);
    })
    .map(([id]) => Number(id));
}

function detectCategoryIntent(query) {
  const normalized = normalizeKeyword(query);
  return getCategoryIntents().find((intent) =>
    intent.keywords.some((keyword) => normalized.includes(normalizeKeyword(keyword)))
  ) || null;
}

function getCategoryIntents() {
  return [
    { label: "인기작", keywords: ["인기", "popular"], path: "/movie/popular", params: {} },
    { label: "트렌딩", keywords: ["트렌드", "트렌딩", "trending"], path: "/trending/movie/week", params: {} },
    { label: "평점 높은 영화", keywords: ["평점", "top", "toprated", "고평점"], path: "/movie/top_rated", params: {} },
    { label: "현재 상영작", keywords: ["현재", "상영중", "nowplaying"], path: "/movie/now_playing", params: {} },
    { label: "개봉 예정작", keywords: ["예정", "개봉예정", "upcoming"], path: "/movie/upcoming", params: {} }
  ];
}

function normalizeKeyword(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(/\s+/g, "");
}

function dedupeMovies(movies) {
  return movies.filter((movie, idx, arr) => arr.findIndex((item) => item.id === movie.id) === idx);
}

function renderMovies(movies) {
  resultsEl.innerHTML = "";
  movies.forEach((movie) => resultsEl.appendChild(createMovieCard(movie)));
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
  card.querySelector(".detail-btn").addEventListener("click", () => {
    window.location.href = `./movie-detail.html?id=${movie.id}`;
  });
  return card;
}

function renderState(target, type, message) {
  target.innerHTML = `<div class="state-chip state-${type}">${escapeHtml(message)}</div>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
