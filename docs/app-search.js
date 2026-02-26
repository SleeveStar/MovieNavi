const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const TOKEN_STORAGE_KEY = "movienavi_tmdb_token";

const state = {
  token: resolveToken(),
  language: resolveConfig("LANGUAGE", "ko-KR"),
  region: resolveConfig("REGION", "KR"),
  genreMap: {},
  ratings: {},
  rawResults: [],
  searchSections: [],
  searchMeta: null,
  suggestions: [],
  activeSuggestionIndex: -1,
  suggestionRequestId: 0,
  suggestionTimer: null
};

const searchInputEl = document.querySelector("#search-input");
const searchFeedbackEl = document.querySelector("#search-feedback");
const searchResultsEl = document.querySelector("#search-results");
const sortFilterEl = document.querySelector("#filter-sort");
const genreFilterEl = document.querySelector("#filter-genre");
const yearFilterEl = document.querySelector("#filter-year");
const searchFormEl = document.querySelector("#search-form");
const searchSuggestionsEl = document.querySelector("#search-suggestions");
searchResultsEl.classList.remove("movie-grid");

searchFormEl.addEventListener("submit", onSearchSubmit);
[sortFilterEl, genreFilterEl, yearFilterEl].forEach((el) => el.addEventListener("change", applyFilters));
if (searchSuggestionsEl) {
  searchInputEl.addEventListener("input", onSearchInput);
  searchInputEl.addEventListener("keydown", onSearchInputKeyDown);
  searchInputEl.addEventListener("focus", () => {
    if (state.suggestions.length) renderSuggestions();
  });
  document.addEventListener("click", onDocumentClick);
}

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
  hideSuggestions();
  await search(query);
  history.replaceState(null, "", `./search.html?q=${encodeURIComponent(query)}`);
}

async function onSearchInput() {
  if (!searchSuggestionsEl) return;
  const query = searchInputEl.value.trim();
  if (state.suggestionTimer) {
    clearTimeout(state.suggestionTimer);
    state.suggestionTimer = null;
  }
  if (query.length < 2) {
    hideSuggestions();
    return;
  }

  state.suggestionTimer = window.setTimeout(async () => {
    const requestId = ++state.suggestionRequestId;
    try {
      const suggestions = await buildSuggestions(query);
      if (requestId !== state.suggestionRequestId) return;
      state.suggestions = suggestions.slice(0, 8);
      state.activeSuggestionIndex = -1;
      renderSuggestions();
    } catch (error) {
      console.error(error);
      hideSuggestions();
    }
  }, 220);
}

function onSearchInputKeyDown(event) {
  if (!searchSuggestionsEl) return;
  if (searchSuggestionsEl.hidden || !state.suggestions.length) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.activeSuggestionIndex = (state.activeSuggestionIndex + 1) % state.suggestions.length;
    renderSuggestions();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    state.activeSuggestionIndex = (state.activeSuggestionIndex - 1 + state.suggestions.length) % state.suggestions.length;
    renderSuggestions();
    return;
  }

  if (event.key === "Enter" && state.activeSuggestionIndex >= 0) {
    event.preventDefault();
    applySuggestion(state.suggestions[state.activeSuggestionIndex]);
  }
}

function onDocumentClick(event) {
  if (!searchSuggestionsEl) return;
  if (searchFormEl.contains(event.target)) return;
  hideSuggestions();
}

async function search(query) {
  renderSearchSkeleton();
  renderState(searchFeedbackEl, "loading", "검색 중...");

  const matchedGenreIds = findMatchedGenreIds(query);
  const matchedGenreNames = matchedGenreIds.map((id) => state.genreMap[id]).filter(Boolean);
  const categoryIntent = detectCategoryIntent(query);

  const titlePromise = tmdb("/search/movie", { query, include_adult: false, page: 1 });
  const genrePromise = matchedGenreIds.length
    ? tmdb("/discover/movie", {
        include_adult: false,
        sort_by: "popularity.desc",
        with_genres: matchedGenreIds.join(","),
        page: 1
      })
    : Promise.resolve({ results: [] });
  const categoryPromise = categoryIntent
    ? tmdb(categoryIntent.path, categoryIntent.params)
    : Promise.resolve({ results: [] });

  const [titleData, genreData, categoryData] = await Promise.all([titlePromise, genrePromise, categoryPromise]);

  state.searchMeta = {
    titleCount: (titleData.results || []).length,
    matchedGenreNames,
    categoryLabel: categoryIntent ? categoryIntent.label : ""
  };
  state.searchSections = buildSearchSections({
    titleResults: titleData.results || [],
    genreResults: genreData.results || [],
    categoryResults: categoryData.results || [],
    matchedGenreNames,
    categoryLabel: categoryIntent ? categoryIntent.label : ""
  });
  state.rawResults = dedupeMovies([...(titleData.results || []), ...(genreData.results || []), ...(categoryData.results || [])]);
  applyFilters();
}

function applyFilters() {
  const filteredSections = state.searchSections
    .map((section) => ({
      type: section.type,
      priority: section.priority,
      title: section.title,
      movies: filterAndSortMovies(section)
    }))
    .filter((section) => section.movies.length)
    .sort((a, b) => a.priority - b.priority);
  const total = filteredSections.reduce((sum, section) => sum + section.movies.length, 0);

  if (!total) {
    searchResultsEl.innerHTML = "";
    renderState(searchFeedbackEl, "empty", "조건에 맞는 결과가 없습니다.");
    return;
  }

  const hints = [];
  if (state.searchMeta?.titleCount) hints.push("제목 검색 반영");
  if (state.searchMeta?.matchedGenreNames?.length) {
    hints.push(`장르: ${state.searchMeta.matchedGenreNames.slice(0, 2).join(", ")}`);
  }
  if (state.searchMeta?.categoryLabel) hints.push(`카테고리: ${state.searchMeta.categoryLabel}`);

  const hintText = hints.length ? ` · ${hints.join(" · ")}` : "";
  renderState(searchFeedbackEl, "ok", `${total}개의 결과${hintText}`);
  renderSectionResults(filteredSections);
}

function detectCategoryIntent(query) {
  const normalized = normalizeKeyword(query);
  return getCategoryIntents().find((intent) =>
    intent.keywords.some((keyword) => normalized.includes(normalizeKeyword(keyword)))
  ) || null;
}

function getCategoryIntents() {
  return [
    { label: "인기작", keywords: ["인기", "popular"], path: "/movie/popular", params: { page: 1 } },
    { label: "트렌딩", keywords: ["트렌드", "트렌딩", "trending"], path: "/trending/movie/week", params: {} },
    { label: "평점 높은 영화", keywords: ["평점", "top", "toprated", "고평점"], path: "/movie/top_rated", params: { page: 1 } },
    { label: "현재 상영작", keywords: ["현재", "상영중", "nowplaying"], path: "/movie/now_playing", params: { page: 1 } },
    { label: "개봉 예정작", keywords: ["예정", "개봉예정", "upcoming"], path: "/movie/upcoming", params: { page: 1 } }
  ];
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

function normalizeKeyword(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(/\s+/g, "");
}

function dedupeMovies(movies) {
  return movies.filter((movie, idx, arr) => arr.findIndex((item) => item.id === movie.id) === idx);
}

function buildSearchSections({ titleResults, genreResults, categoryResults, matchedGenreNames, categoryLabel }) {
  const sections = [];
  const seenIds = new Set();

  const sectionConfig = {
    title: { priority: 1, limit: 18 },
    genre: { priority: 2, limit: 14 },
    category: { priority: 3, limit: 12 }
  };

  const pushSection = (type, title, movies) => {
    const unique = [];
    for (const movie of movies) {
      if (!movie?.id || seenIds.has(movie.id)) continue;
      seenIds.add(movie.id);
      unique.push(movie);
    }
    if (unique.length) {
      sections.push({
        type,
        title,
        priority: sectionConfig[type].priority,
        limit: sectionConfig[type].limit,
        movies: unique
      });
    }
  };

  pushSection("title", "제목 일치", titleResults);
  if (matchedGenreNames.length) {
    pushSection("genre", `장르 추천 (${matchedGenreNames.slice(0, 2).join(", ")})`, genreResults);
  }
  if (categoryLabel) {
    pushSection("category", `카테고리 추천 (${categoryLabel})`, categoryResults);
  }

  return sections;
}

function filterAndSortMovies(section) {
  const movies = section.movies || [];
  const sort = sortFilterEl.value;
  const genre = genreFilterEl.value;
  const year = yearFilterEl.value;

  const filtered = movies
    .filter((movie) => !genre || (movie.genre_ids || []).includes(Number(genre)))
    .filter((movie) => !year || String(movie.release_date || "").startsWith(year));

  filtered.sort((a, b) => {
    if (sort === "rating") return (b.vote_average || 0) - (a.vote_average || 0);
    if (sort === "latest") return String(b.release_date || "").localeCompare(String(a.release_date || ""));
    return (b.popularity || 0) - (a.popularity || 0);
  });

  return filtered.slice(0, section.limit || 24);
}

function renderSectionResults(sections) {
  searchResultsEl.innerHTML = "";
  sections.forEach((section) => {
    const wrap = document.createElement("section");
    wrap.className = "section-block";

    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = `<h2>${escapeHtml(section.title)}</h2>`;

    const grid = document.createElement("div");
    grid.className = "movie-grid";
    section.movies.forEach((movie) => grid.appendChild(createMovieCard(movie)));

    wrap.appendChild(head);
    wrap.appendChild(grid);
    searchResultsEl.appendChild(wrap);
  });
}

async function buildSuggestions(query) {
  const normalized = normalizeKeyword(query);
  const moviePromise = tmdb("/search/movie", { query, include_adult: false, page: 1 });
  const [movieData] = await Promise.all([moviePromise]);
  const movieItems = (movieData.results || []).slice(0, 5).map((movie) => ({
    type: "영화",
    label: movie.title || "제목 없음",
    value: movie.title || "",
    movieId: movie.id
  }));

  const genreItems = Object.entries(state.genreMap)
    .filter(([, name]) => normalizeKeyword(name).includes(normalized) || normalized.includes(normalizeKeyword(name)))
    .slice(0, 2)
    .map(([, name]) => ({
      type: "장르",
      label: `${name} 장르 보기`,
      value: name
    }));

  const categoryItems = getCategoryIntents()
    .filter((intent) => intent.keywords.some((keyword) => normalizeKeyword(keyword).includes(normalized) || normalized.includes(normalizeKeyword(keyword))))
    .slice(0, 2)
    .map((intent) => ({
      type: "카테고리",
      label: intent.label,
      value: intent.keywords[0]
    }));

  return [...movieItems, ...genreItems, ...categoryItems];
}

function renderSuggestions() {
  if (!searchSuggestionsEl) return;
  if (!state.suggestions.length) {
    hideSuggestions();
    return;
  }

  searchSuggestionsEl.innerHTML = "";
  state.suggestions.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `suggest-item${index === state.activeSuggestionIndex ? " is-active" : ""}`;
    button.innerHTML = `
      <span class="suggest-type">${escapeHtml(item.type)}</span>
      <span class="suggest-label">${escapeHtml(item.label)}</span>
    `;
    button.addEventListener("click", () => applySuggestion(item));
    searchSuggestionsEl.appendChild(button);
  });
  searchSuggestionsEl.hidden = false;
}

function hideSuggestions() {
  if (!searchSuggestionsEl) return;
  if (state.suggestionTimer) {
    clearTimeout(state.suggestionTimer);
    state.suggestionTimer = null;
  }
  state.suggestions = [];
  state.activeSuggestionIndex = -1;
  searchSuggestionsEl.hidden = true;
  searchSuggestionsEl.innerHTML = "";
}

function applySuggestion(item) {
  searchInputEl.value = item.value || "";
  hideSuggestions();
  if (item.movieId) {
    window.location.href = `./movie-detail.html?id=${item.movieId}`;
    return;
  }
  const query = searchInputEl.value.trim();
  if (!query) return;
  void search(query);
  history.replaceState(null, "", `./search.html?q=${encodeURIComponent(query)}`);
}

function renderSearchSkeleton() {
  searchResultsEl.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "movie-grid";
  for (let i = 0; i < 10; i += 1) {
    const skeleton = document.createElement("article");
    skeleton.className = "movie-card skeleton-card";
    skeleton.innerHTML = `
      <div class="skeleton-poster"></div>
      <div class="movie-meta">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
    grid.appendChild(skeleton);
  }
  searchResultsEl.appendChild(grid);
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
