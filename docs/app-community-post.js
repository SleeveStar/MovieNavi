const stageEl = document.querySelector("#community-post-stage");

bootstrap();

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const postId = Number(params.get("id"));
  if (!postId) {
    stageEl.innerHTML = "<div class='state-chip state-error'>잘못된 접근입니다.</div>";
    return;
  }

  await render(postId);
}

async function render(postId) {
  const response = await api(`/api/community/posts/${postId}`);
  if (!response.ok || !response.data) {
    stageEl.innerHTML = "<div class='state-chip state-error'>게시글을 불러오지 못했습니다.</div>";
    return;
  }

  const post = response.data;
  const auth = typeof window.getMovienaviAuthState === "function"
    ? await window.getMovienaviAuthState()
    : { ok: false, data: null };
  const isLoggedIn = Boolean(auth.ok && auth.data?.displayName);

  const comments = Array.isArray(post.comments) ? post.comments : [];
  const commentItems = renderCommentTree(comments, auth.data?.id || null);

  stageEl.innerHTML = `
    <article class="community-post-detail">
      <div class="community-post-detail-head">
        <a class="light-action-btn" href="/community/board?code=${encodeURIComponent(post.boardCode)}">목록으로</a>
        ${post.editable ? `
          <div class="community-post-owner-actions">
            <a class="light-action-btn" href="/community/write?board=${encodeURIComponent(post.boardCode)}&postId=${Number(post.id)}">수정</a>
            <button type="button" id="community-post-delete" class="link-btn">게시글 삭제</button>
          </div>
        ` : ""}
      </div>
      <h2>${escapeHtml(post.title || "제목 없음")}</h2>
      <p class="community-post-detail-meta">${escapeHtml(post.authorDisplayName || "익명")} · 조회 ${Number(post.viewCount || 0)} · 추천 ${Number(post.recommendCount || 0)} · ${formatDateTime(post.createdAt)}</p>
      <div class="community-post-recommend">
        ${isLoggedIn
          ? `<button type="button" id="community-recommend-toggle" class="light-action-btn ${post.recommendedByMe ? "is-active" : ""}">
               👍 ${post.recommendedByMe ? "추천 취소" : "추천"} (${Number(post.recommendCount || 0)})
             </button>`
          : `<a class="light-action-btn" href="/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}">로그인 후 추천</a>`}
      </div>
      ${post.imageUrl ? `<img class="community-post-image" src="${escapeHtml(post.imageUrl)}" alt="${escapeHtml(post.title || "게시글 이미지")}" loading="lazy" />` : ""}
      <div class="community-post-detail-content">${escapeHtml(post.content || "").replaceAll("\n", "<br />")}</div>
    </article>

    <section class="community-comments">
      <h3>댓글 ${comments.length}</h3>
      <ul id="community-comment-list" class="community-comment-list">${commentItems}</ul>
      <form id="community-comment-form" class="community-comment-form">
        <textarea id="community-comment-input" maxlength="1000" placeholder="댓글을 입력하세요." ${isLoggedIn ? "" : "disabled"}></textarea>
        <input id="community-parent-comment-id" type="hidden" value="" />
        <p id="community-reply-target" class="muted"></p>
        <div class="community-comment-actions">
          ${isLoggedIn ? '<button type="submit" class="eval-skip">댓글 등록</button>' : `<a class="light-action-btn" href="/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}">로그인 후 댓글 작성</a>`}
          ${isLoggedIn ? '<button type="button" id="community-reply-cancel" class="light-action-btn" hidden>답글 취소</button>' : ""}
        </div>
      </form>
      <div id="community-comment-status" class="state-line"></div>
    </section>
  `;

  if (post.editable) {
    const deleteBtn = document.querySelector("#community-post-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!window.confirm("게시글을 삭제할까요?")) return;
        const deleted = await api(`/api/community/posts/${postId}`, "DELETE");
        if (!deleted.ok) {
          alert(deleted.data?.message || "삭제에 실패했습니다.");
          return;
        }
        window.location.href = `/community/board?code=${encodeURIComponent(post.boardCode)}`;
      });
    }
  }

  const recommendBtn = document.querySelector("#community-recommend-toggle");
  if (recommendBtn) {
    recommendBtn.addEventListener("click", async () => {
      const toggled = await api(`/api/community/posts/${postId}/recommend/toggle`, "POST");
      if (!toggled.ok) {
        alert(toggled.data?.message || "추천 처리에 실패했습니다.");
        return;
      }
      await render(postId);
    });
  }

  bindCommentActions(postId, auth.data?.id || null);
}

function bindCommentActions(postId, loginUserId) {
  const form = document.querySelector("#community-comment-form");
  const input = document.querySelector("#community-comment-input");
  const parentInput = document.querySelector("#community-parent-comment-id");
  const replyTarget = document.querySelector("#community-reply-target");
  const replyCancelBtn = document.querySelector("#community-reply-cancel");
  const status = document.querySelector("#community-comment-status");
  if (!form || !input || !status || !parentInput || !replyTarget) return;

  const resetReplyTarget = () => {
    parentInput.value = "";
    replyTarget.textContent = "";
    if (replyCancelBtn) {
      replyCancelBtn.hidden = true;
    }
  };

  if (replyCancelBtn) {
    replyCancelBtn.addEventListener("click", resetReplyTarget);
  }

  document.querySelectorAll(".community-comment-reply").forEach((replyBtn) => {
    replyBtn.addEventListener("click", () => {
      const commentId = Number(replyBtn.dataset.commentId || 0);
      const authorName = replyBtn.dataset.authorName || "작성자";
      if (!commentId) return;
      parentInput.value = String(commentId);
      replyTarget.textContent = `${authorName}님에게 답글 작성 중`;
      if (replyCancelBtn) {
        replyCancelBtn.hidden = false;
      }
      input.focus();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) return;

    const parentCommentId = parentInput.value ? Number(parentInput.value) : null;
    const created = await api(`/api/community/posts/${postId}/comments`, "POST", { content, parentCommentId });
    if (!created.ok) {
      status.innerHTML = `<div class='state-chip state-error'>${escapeHtml(created.data?.message || "댓글 등록 실패")}</div>`;
      return;
    }

    input.value = "";
    resetReplyTarget();
    await render(postId);
  });

  document.querySelectorAll(".community-comment-item").forEach((item) => {
    const authorId = Number(item.dataset.commentAuthor || 0);
    const commentId = Number(item.dataset.commentId || 0);
    if (!loginUserId || !commentId || loginUserId !== authorId) return;

    const deleteBtn = item.querySelector(".community-comment-delete");
    if (!deleteBtn) return;
    deleteBtn.hidden = false;
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm("댓글을 삭제할까요?")) return;
      const deleted = await api(`/api/community/comments/${commentId}`, "DELETE");
      if (!deleted.ok) {
        alert(deleted.data?.message || "댓글 삭제 실패");
        return;
      }
      await render(postId);
    });
  });
}

function renderCommentTree(comments, loginUserId) {
  if (!comments.length) {
    return "<li class='muted'>댓글이 없습니다.</li>";
  }

  const parentRows = comments.filter((comment) => !comment.parentCommentId);
  const childByParentId = new Map();
  comments.forEach((comment) => {
    if (!comment.parentCommentId) return;
    const parentId = Number(comment.parentCommentId);
    if (!childByParentId.has(parentId)) {
      childByParentId.set(parentId, []);
    }
    childByParentId.get(parentId).push(comment);
  });

  const renderRow = (comment, isReply = false) => {
    const canDelete = loginUserId && Number(loginUserId) === Number(comment.authorUserId);
    return `
      <li class="community-comment-item ${isReply ? "is-reply" : ""}" data-comment-id="${Number(comment.id)}" data-comment-author="${Number(comment.authorUserId)}">
        <p>${escapeHtml(comment.content || "")}</p>
        <div class="community-comment-meta">
          <span>${escapeHtml(comment.authorDisplayName || "익명")}</span>
          <span>${formatDateTime(comment.createdAt)}</span>
          ${loginUserId ? `<button type="button" class="link-btn community-comment-reply" data-comment-id="${Number(comment.id)}" data-author-name="${escapeHtml(comment.authorDisplayName || "작성자")}">답글</button>` : ""}
          ${canDelete ? '<button type="button" class="link-btn community-comment-delete">삭제</button>' : ""}
        </div>
      </li>
    `;
  };

  return parentRows
    .map((parent) => {
      const children = childByParentId.get(Number(parent.id)) || [];
      const childRows = children.map((child) => renderRow(child, true)).join("");
      return `${renderRow(parent)}${childRows}`;
    })
    .join("");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
