const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const TOKEN_STORAGE_KEY = "movienavi_tmdb_token";
const EVAL_PLACEHOLDER_IMAGE = "./logos/movienavi_logo_gradient.png";

const state = {
  token: resolveToken(),
  language: resolveConfig("LANGUAGE", "ko-KR"),
  region: resolveConfig("REGION", "KR"),
  ratings: {},
  evalQueue: [],
  evalSeenIds: new Set(),
  evalCurrent: null,
  oldTotalPages: 500,
  isAnimating: false,
  isLoggedIn: false
};

const evalSlotEl = document.querySelector("#eval-slot");
const evalPosterEl = document.querySelector("#eval-poster");
const evalTitleEl = document.querySelector("#eval-title");
const evalOverviewEl = document.querySelector("#eval-overview");
const evalReviewEl = document.querySelector("#eval-review");
const evalSpoilerEl = document.querySelector("#eval-spoiler");
const evalStarsEl = document.querySelector("#eval-stars");
const evalSkipBtn = document.querySelector("#eval-skip");
const AUTH_ACTIONS_ID = "eval-auth-required-actions";

evalSkipBtn.addEventListener("click", async () => {
  await transitionToNextMovie();
});

bootstrap();

async function bootstrap() {
  try {
    if (!state.token || state.token.includes("PASTE_YOUR_TMDB")) {
      const entered = window.prompt("TMDB Read Access Token을 입력하세요.");
      if (!entered) return;
      state.token = entered.trim();
      localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
    }

    const me = await api("/api/auth/me");
    state.isLoggedIn = me.ok;
    if (!state.isLoggedIn) {
      evalPosterEl.src = EVAL_PLACEHOLDER_IMAGE;
      evalPosterEl.alt = "로그인 안내 이미지";
      evalPosterEl.classList.add("eval-poster-placeholder");
      removeAuthRequiredActions();
      evalTitleEl.textContent = "로그인이 필요합니다.";
      evalOverviewEl.textContent = "로그인 후 평가를 저장할 수 있습니다.";
      renderAuthRequiredActions();
      evalSkipBtn.disabled = true;
      evalStarsEl.innerHTML = "";
      return;
    }
    removeAuthRequiredActions();

    await loadRatingsFromApi();
    renderEvaluationStars();
    await ensureEvaluationMovie();
    renderEvaluationMovie();
    animateIn();
  } catch (error) {
    console.error(error);
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

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  const mergedParams = {
    language: state.language,
    region: state.region,
    ...params
  };
  Object.entries(mergedParams).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  });

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`);
  return res.json();
}

async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

function renderEvaluationStars() {
  evalStarsEl.innerHTML = "";
  for (let i = 1; i <= 5; i += 1) {
    const btn = document.createElement("button");
    btn.className = "star eval-star";
    btn.textContent = `${i}★`;
    btn.addEventListener("click", async () => {
      if (!state.evalCurrent || state.isAnimating) return;
      await setRating(state.evalCurrent, i);
      await transitionToNextMovie();
    });
    evalStarsEl.appendChild(btn);
  }
}

function renderEvaluationMovie() {
  if (!state.evalCurrent) {
    evalPosterEl.classList.remove("eval-poster-placeholder");
    evalPosterEl.removeAttribute("src");
    evalPosterEl.alt = "평가할 영화를 불러오는 중";
    evalTitleEl.textContent = "불러오는 중...";
    evalOverviewEl.textContent = "";
    evalReviewEl.value = "";
    evalSpoilerEl.checked = false;
    return;
  }

  const movie = state.evalCurrent;
  evalPosterEl.classList.remove("eval-poster-placeholder");
  evalPosterEl.src = movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : "";
  evalPosterEl.alt = movie.title ? `${movie.title} 포스터` : "영화 포스터";
  evalTitleEl.textContent = movie.title || "제목 없음";
  evalOverviewEl.textContent = (movie.overview || "줄거리 정보가 없습니다.").slice(0, 130);
  evalReviewEl.value = "";
  evalSpoilerEl.checked = false;
}

function renderAuthRequiredActions() {
  const wrap = document.createElement("div");
  wrap.id = AUTH_ACTIONS_ID;
  wrap.className = "auth-required-actions auth-required-actions-block";
  wrap.innerHTML = `
    <a class="light-action-btn" href="./login.html">로그인</a>
    <a class="light-action-btn" href="./signup.html">회원가입</a>
  `;
  evalOverviewEl.insertAdjacentElement("afterend", wrap);
}

function removeAuthRequiredActions() {
  const existing = document.getElementById(AUTH_ACTIONS_ID);
  if (existing) existing.remove();
}

async function setRating(movie, rating) {
  const reviewText = evalReviewEl.value.trim();
  const payload = {
    rating,
    title: movie.title || "제목 없음",
    posterPath: movie.poster_path || null,
    genreIds: movie.genre_ids || [],
    reviewText: reviewText || null,
    isSpoiler: reviewText ? Boolean(evalSpoilerEl.checked) : null
  };
  const response = await api(`/api/ratings/${movie.id}`, "PUT", payload);
  if (response.ok && response.data) {
    state.ratings[movie.id] = response.data;
  }
}

async function ensureEvaluationMovie() {
  if (state.evalCurrent) return;
  await fillEvaluationQueue(1);
  state.evalCurrent = state.evalQueue.shift() || null;
}

async function transitionToNextMovie() {
  if (state.isAnimating) return;
  state.isAnimating = true;
  evalSlotEl.classList.remove("is-entering");
  evalSlotEl.classList.add("is-leaving");
  await wait(170);
  evalSlotEl.classList.remove("is-leaving");

  state.evalCurrent = null;
  await ensureEvaluationMovie();
  renderEvaluationMovie();
  animateIn();
  state.isAnimating = false;
}

function animateIn() {
  evalSlotEl.classList.remove("is-entering");
  void evalSlotEl.offsetWidth;
  evalSlotEl.classList.add("is-entering");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fillEvaluationQueue(minSize) {
  let guard = 0;
  while (state.evalQueue.length < minSize && guard < 25) {
    guard += 1;
    const page = await pickRandomOldPage();
    const data = await tmdb("/discover/movie", {
      include_adult: false,
      sort_by: "primary_release_date.asc",
      "primary_release_date.lte": "2009-12-31",
      "vote_count.gte": 20,
      page
    });

    const totalPages = Number(data.total_pages || 1);
    state.oldTotalPages = Math.min(totalPages, 500);

    const ratedIds = new Set(Object.keys(state.ratings).map((id) => Number(id)));
    const candidates = shuffle(
      (data.results || []).filter(
        (movie) => movie.poster_path && !state.evalSeenIds.has(movie.id) && !ratedIds.has(movie.id)
      )
    );

    candidates.forEach((movie) => {
      state.evalSeenIds.add(movie.id);
      state.evalQueue.push(movie);
    });
  }
}

async function pickRandomOldPage() {
  if (!state.oldTotalPages || state.oldTotalPages < 2) {
    const warmup = await tmdb("/discover/movie", {
      include_adult: false,
      sort_by: "primary_release_date.asc",
      "primary_release_date.lte": "2009-12-31",
      "vote_count.gte": 20,
      page: 1
    });
    state.oldTotalPages = Math.min(Number(warmup.total_pages || 1), 500);
  }
  return 1 + Math.floor(Math.random() * Math.max(1, state.oldTotalPages));
}

function shuffle(list) {
  const copied = list.slice();
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

