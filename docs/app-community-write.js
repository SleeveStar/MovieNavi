const titleEl = document.querySelector("#community-write-title");
const formEl = document.querySelector("#community-write-form");
const subjectEl = document.querySelector("#community-write-subject");
const imageFileEl = document.querySelector("#community-write-image-file");
const imageUrlEl = document.querySelector("#community-write-image-url");
const imageClearEl = document.querySelector("#community-write-image-clear");
const imagePreviewEl = document.querySelector("#community-write-image-preview");
const contentEl = document.querySelector("#community-write-content");
const cancelEl = document.querySelector("#community-write-cancel");
const statusEl = document.querySelector("#community-write-status");

const state = {
  boardCode: "",
  uploading: false,
  editPostId: null
};

bootstrap();

async function bootstrap() {
  const auth = typeof window.getMovienaviAuthState === "function"
    ? await window.getMovienaviAuthState()
    : { ok: false, data: null };
  if (!(auth.ok && auth.data?.displayName)) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const postId = Number(params.get("postId"));
  const boardCode = (params.get("board") || "").trim();
  if (postId) {
    await initEditMode(postId);
    return;
  }

  if (!boardCode) {
    statusEl.innerHTML = "<div class='state-chip state-error'>게시판 정보가 없습니다.</div>";
    return;
  }

  state.boardCode = boardCode;
  cancelEl.href = `/community/board?code=${encodeURIComponent(boardCode)}`;

  const boards = await api("/api/community/boards");
  const boardName = boards.ok && Array.isArray(boards.data)
    ? boards.data.find((board) => board.code === boardCode)?.name
    : null;
  titleEl.textContent = boardName ? `${boardName} 글쓰기` : "글쓰기";
}

async function initEditMode(postId) {
  const postResponse = await api(`/api/community/posts/${postId}`);
  if (!postResponse.ok || !postResponse.data) {
    statusEl.innerHTML = "<div class='state-chip state-error'>수정할 게시글을 찾을 수 없습니다.</div>";
    return;
  }

  const post = postResponse.data;
  if (!post.editable) {
    statusEl.innerHTML = "<div class='state-chip state-error'>게시글 수정 권한이 없습니다.</div>";
    return;
  }

  state.editPostId = postId;
  state.boardCode = post.boardCode;
  titleEl.textContent = `${post.boardName || "게시판"} 게시글 수정`;
  subjectEl.value = post.title || "";
  contentEl.value = post.content || "";
  imageUrlEl.value = post.imageUrl || "";
  cancelEl.href = `/community/post?id=${postId}`;

  if (post.imageUrl) {
    imagePreviewEl.src = post.imageUrl;
    imagePreviewEl.hidden = false;
  }
}

imageFileEl.addEventListener("change", async () => {
  const file = imageFileEl.files && imageFileEl.files[0];
  if (!file) {
    imageUrlEl.value = "";
    imagePreviewEl.hidden = true;
    imagePreviewEl.removeAttribute("src");
    return;
  }

  state.uploading = true;
  statusEl.innerHTML = "<div class='state-chip state-ok'>이미지를 업로드하는 중입니다...</div>";
  const uploaded = await uploadImage(file);
  state.uploading = false;

  if (!uploaded.ok || !uploaded.data?.url) {
    imageUrlEl.value = "";
    imagePreviewEl.hidden = true;
    imagePreviewEl.removeAttribute("src");
    statusEl.innerHTML = `<div class='state-chip state-error'>${escapeHtml(uploaded.data?.message || "이미지 업로드 실패")}</div>`;
    return;
  }

  imageUrlEl.value = uploaded.data.url;
  imagePreviewEl.src = uploaded.data.url;
  imagePreviewEl.hidden = false;
  statusEl.innerHTML = "<div class='state-chip state-ok'>이미지 업로드 완료</div>";
});

imageClearEl.addEventListener("click", () => {
  imageUrlEl.value = "";
  imageFileEl.value = "";
  imagePreviewEl.hidden = true;
  imagePreviewEl.removeAttribute("src");
  statusEl.innerHTML = "<div class='state-chip state-ok'>이미지를 제거했습니다.</div>";
});

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.boardCode) return;
  if (state.uploading) {
    statusEl.innerHTML = "<div class='state-chip state-error'>이미지 업로드가 완료된 후 등록해 주세요.</div>";
    return;
  }

  const payload = {
    title: subjectEl.value.trim(),
    content: contentEl.value.trim(),
    imageUrl: imageUrlEl.value.trim() || null
  };
  if (!payload.title || !payload.content) {
    statusEl.innerHTML = "<div class='state-chip state-error'>제목과 내용을 입력해 주세요.</div>";
    return;
  }

  if (state.editPostId) {
    const updated = await api(`/api/community/posts/${state.editPostId}`, "PATCH", payload);
    if (!updated.ok) {
      statusEl.innerHTML = `<div class='state-chip state-error'>${escapeHtml(updated.data?.message || "게시글 수정 실패")}</div>`;
      return;
    }
    window.location.href = `/community/post?id=${Number(state.editPostId)}`;
    return;
  }

  const created = await api(`/api/community/boards/${encodeURIComponent(state.boardCode)}/posts`, "POST", payload);
  if (!created.ok || !created.data?.postId) {
    statusEl.innerHTML = `<div class='state-chip state-error'>${escapeHtml(created.data?.message || "게시글 등록 실패")}</div>`;
    return;
  }

  window.location.href = `/community/post?id=${Number(created.data.postId)}`;
});

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

async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/community/uploads/image", {
    method: "POST",
    credentials: "include",
    body: formData
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
