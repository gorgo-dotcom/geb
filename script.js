const GEB_API_BASE_URL = (
  window.GEB_API_BASE_URL || "https://api.geb.ge"
).replace(/\/+$/, "");

function getLikeClientID() {
  const storageKey = "geb-like-client-id";
  let clientID = localStorage.getItem(storageKey);

  if (!clientID) {
    clientID = crypto.randomUUID();
    localStorage.setItem(storageKey, clientID);
  }

  return clientID;
}

async function plk(postID, clientID, liked) {
  const numericPostID = Number(postID);
  if (!Number.isSafeInteger(numericPostID) || numericPostID <= 0) {
    throw new Error("This post has no database ID yet. Regenerate posts.js from the CMS.");
  }

  const response = await fetch(`${GEB_API_BASE_URL}/api/DBManager/likes/set`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ PostID: numericPostID, ClientID: clientID, Liked: liked })
  });

  if (!response.ok) {
    throw new Error(`Like request failed (${response.status}).`);
  }

  return response.json();
}

document.addEventListener("DOMContentLoaded", () => {
  const postsFeed = document.getElementById("postsFeed");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabsWrapper = document.querySelector(".tabs-wrapper");
  const postSearchInput = document.getElementById("postSearchInput");
  const postSearchClear = document.getElementById("postSearchClear");
  const readingProgress = document.querySelector(".reading-progress");
  const readingProgressFill = readingProgress.querySelector(".reading-progress-fill");

  tabsWrapper.addEventListener("wheel", (event) => {
    if (tabsWrapper.scrollWidth <= tabsWrapper.clientWidth) return;

    const wheelDistance = Math.abs(event.deltaY) > Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    if (!wheelDistance) return;

    event.preventDefault();
    tabsWrapper.scrollLeft += wheelDistance;
  }, { passive: false });

  const imageViewer = document.createElement("div");
  imageViewer.className = "image-viewer";
  imageViewer.hidden = true;
  imageViewer.setAttribute("role", "dialog");
  imageViewer.setAttribute("aria-modal", "true");
  imageViewer.setAttribute("aria-label", "სურათის გადიდებული ხედი");
  imageViewer.innerHTML = `
    <div class="image-viewer-frame">
      <button class="image-viewer-close" type="button" aria-label="დახურვა" title="დახურვა">×</button>
      <img class="image-viewer-image" alt="">
    </div>
  `;
  document.body.appendChild(imageViewer);
  const viewerImage = imageViewer.querySelector(".image-viewer-image");

  function closeImageViewer() {
    imageViewer.hidden = true;
    viewerImage.removeAttribute("src");
    document.body.classList.remove("image-viewer-open");
  }

  postsFeed.addEventListener("click", (event) => {
    const image = event.target.closest(".post-media img");
    if (!image) return;

    viewerImage.src = image.currentSrc || image.src;
    viewerImage.alt = image.alt;
    imageViewer.hidden = false;
    document.body.classList.add("image-viewer-open");
  });

  imageViewer.addEventListener("click", (event) => {
    if (event.target === imageViewer || event.target === viewerImage || event.target.closest(".image-viewer-close")) {
      closeImageViewer();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !imageViewer.hidden) closeImageViewer();
  });

const PAGE_SIZE = 15;
let currentCategory = "All";
let currentPage = 1;
let isLoading = false;
let filteredPosts = [];
let speechEnabled = false;
let currentSpeechCard = null;
let currentUtterance = null;
let priorityImagePostID = null;

  // Add an internal ID without changing the data stored in posts.js.
  posts.forEach((post, index) => {
    post.id = String(post.id || `post-${index + 1}`);
  });

  const toast = document.createElement("div");
  toast.className = "toast-notice";
  document.body.appendChild(toast);

  function showToast(message = "ლინკი დაკოპირებულია!") {
    toast.innerText = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
  }

  function getPostURL(postId) {
    const baseURL = window.location.origin + window.location.pathname;
    return `${baseURL}#${postId}`;
  }

  function prioritizePostImage(post) {
    if (!post) return;

    priorityImagePostID = String(post.id);
    const imageUrl = post.imageUrl || `https://picsum.photos/600/400?random=${post.id}`;
    let preload = document.getElementById("priorityPostImagePreload");

    if (!preload) {
      preload = document.createElement("link");
      preload.id = "priorityPostImagePreload";
      preload.rel = "preload";
      preload.as = "image";
      preload.fetchPriority = "high";
      document.head.appendChild(preload);
    }

    preload.href = new URL(imageUrl, document.baseURI).href;

    const targetImage = document.getElementById(priorityImagePostID)?.querySelector(".post-media img");
    if (targetImage) {
      targetImage.fetchPriority = "high";
      targetImage.loading = "eager";
    }
  }

  function prioritizeImageFromCurrentHash() {
    const rawID = window.location.hash.slice(1);
    if (!rawID) return;

    let postID = rawID;
    try { postID = decodeURIComponent(rawID); } catch { /* Keep the raw fragment. */ }
    const targetPost = posts.find(post => String(post.id) === postID);
    if (targetPost) prioritizePostImage(targetPost);
  }

  // Start downloading a directly linked post's image before rendering earlier batches.
  prioritizeImageFromCurrentHash();

  const loader = document.createElement("div");
  loader.className = "feed-loader";
  loader.innerHTML = `<div class="spinner"></div>`;

  function updateStructuredData(postsToInclude) {
    let scriptTag = document.getElementById("jsonLdData");

    if (!scriptTag) {
      scriptTag = document.createElement("script");
      scriptTag.id = "jsonLdData";
      scriptTag.type = "application/ld+json";
      document.head.appendChild(scriptTag);
    }

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "itemListElement": postsToInclude.map((post, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "item": {
          "@type": "SocialMediaPosting",
          "@id": getPostURL(post.id),
          "headline": post.content.substring(0, 80),
          "articleBody": post.content,
          ...(post.imageUrl ? { "image": post.imageUrl } : {}),
          ...(post.createdDate ? { "datePublished": post.createdDate } : {}),
          "articleSection": post.category
        }
      }))
    };

    scriptTag.textContent = JSON.stringify(jsonLd);
  }

  function updateMetaForSeo(category) {
    const title = category === "All"
      ? "GEB & Insights - საინტერესო ფაქტები და რჩევები"
      : `${category} - GEB & Insights`;

    document.title = title;

    const canonical = document.getElementById("canonicalUrl");
    if (canonical) {
      canonical.href = window.location.origin + window.location.pathname + (window.location.hash || "");
    }
  }

  function createPostCard(post) {
    const card = document.createElement("article");
    card.className = "post-card";
    card.id = post.id;

    card.setAttribute("itemscope", "");
    card.setAttribute("itemtype", "https://schema.org/SocialMediaPosting");

    const shareURL = encodeURIComponent(getPostURL(post.id));
    const shareTitle = encodeURIComponent(
      post.content ? post.content.substring(0, 60) + "..." : "GEB & Insights"
    );

	const imageUrl = post.imageUrl || `https://picsum.photos/600/400?random=${post.id}`;
    const isPriorityImage = String(post.id) === priorityImagePostID;

    const mediaHTML = imageUrl
      ? `
        <div class="post-media">
          <img src="${imageUrl}" alt="${post.category} - ${post.content.substring(0, 30)}" itemprop="image" loading="${isPriorityImage ? "eager" : "lazy"}" fetchpriority="${isPriorityImage ? "high" : "auto"}" onerror="this.onerror=null; this.src='empty.png';">
          <span class="post-category-tag" data-type="${post.category}" itemprop="articleSection">${post.category}</span>
        </div>
      `
      : `
        <div class="post-media post-media-no-image">
          <span class="post-category-tag" data-type="${post.category}" itemprop="articleSection">${post.category}</span>
        </div>
      `;

      const dateHTML = "";// post.type == 10 && post.createdDate ? `<span class="post-date">📅 <time itemprop="datePublished" datetime="${post.createdDate}">${post.createdDate}</time></span>`: "";

       const sourceHTML = post.sourceUrl
          ? `<a href="${post.sourceUrl}" target="_blank" rel="noopener noreferrer" class="post-source">წყარო</a>`: "";

    card.innerHTML = `
      ${mediaHTML}
      <div class="post-body">
        <p class="post-text" itemprop="articleBody">${post.content}</p>
        <div class="post-meta">
          <div class="post-info">
            ${dateHTML}
            ${sourceHTML}
          </div>
          <div class="post-actions">
            <button class="like-btn" type="button" data-id="${post.id}" aria-label="მოწონება: ${post.likes || 0}" aria-pressed="false" title="მოწონება">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              <span class="like-count" aria-hidden="true">${post.likes || 0}</span>
            </button>
            <div class="post-share">
            <a href="https://www.facebook.com/sharer/sharer.php?u=${shareURL}" target="_blank" rel="noopener noreferrer" class="share-btn fb" title="Facebook-ზე გაზიარება">
              <svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <button class="share-btn copy" data-id="${post.id}" title="ლინკის დაკოპირება">
              <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1-.9 2-2-2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            </button>
            </div>
          </div>
        </div>
      </div>
    `;

    card.querySelector(".share-btn.copy").addEventListener("click", (e) => {
      e.preventDefault();
      navigator.clipboard.writeText(getPostURL(post.id)).then(() => {
        showToast("ლინკი დაკოპირებულია ბუფერში!");
      });
    });

    card.querySelector(".like-btn").addEventListener("click", async (e) => {
      const button = e.currentTarget;
      const liked = button.getAttribute("aria-pressed") !== "true";
      const countElement = button.querySelector(".like-count");
      const previousCount = Number.parseInt(countElement.textContent, 10) || 0;
      const nextCount = Math.max(0, previousCount + (liked ? 1 : -1));

      button.disabled = true;
      button.setAttribute("aria-pressed", String(liked));
      countElement.textContent = String(nextCount);
      button.setAttribute("aria-label", `მოწონება: ${nextCount}`);
      button.title = `მოწონება: ${nextCount}`;

      try {
        const result = await plk(post.id, getLikeClientID(), liked);
        button.setAttribute("aria-pressed", String(result.liked));
      } catch (error) {
        button.setAttribute("aria-pressed", String(!liked));
        countElement.textContent = String(previousCount);
        button.setAttribute("aria-label", `მოწონება: ${previousCount}`);
        button.title = `მოწონება: ${previousCount}`;
        console.error("Unable to update like:", error);
        showToast("მოწონების შენახვა ვერ მოხერხდა. სცადეთ მოგვიანებით.");
      } finally {
        button.disabled = false;
      }
    });

    return card;
  }

  	function getFilteredPosts(type) {
	  const query = postSearchInput.value.trim().toLocaleLowerCase();
	  return posts.filter(post => {
		const matchesCategory = type === "All" || post.type == type;
		const searchableText = [post.content, post.category, post.sourceUrl]
		  .filter(Boolean)
		  .join(" ")
		  .toLocaleLowerCase();
		return matchesCategory && (!query || searchableText.includes(query));
	  });
    }

    function updateReadingProgress() {
      const totalPosts = filteredPosts.length;
      let percent = 0;

      if (totalPosts > 0 && window.scrollY > 0) {
        const headerBottom = document.querySelector(".navbar-header").getBoundingClientRect().bottom;
        const cards = postsFeed.querySelectorAll(".post-card[data-post-index]");
        let activeCard = null;

        const lastCard = cards[cards.length - 1];
        if (lastCard && Number(lastCard.dataset.postIndex) === totalPosts) {
          const lastRect = lastCard.getBoundingClientRect();
          if (lastRect.bottom > headerBottom && lastRect.top < window.innerHeight) {
            percent = 100;
          }
        }

        if (percent < 100) {
          for (const card of cards) {
            if (card.getBoundingClientRect().bottom > headerBottom + 1) {
              activeCard = card;
              break;
            }
          }

          if (activeCard) {
            percent = Number(activeCard.dataset.postIndex) / totalPosts * 100;
          } else if (currentPage > 1) {
            percent = Math.min(100, (currentPage - 1) * PAGE_SIZE / totalPosts * 100);
          }
        }
      }

      percent = Math.max(0, Math.min(100, percent));
      readingProgressFill.style.width = `${percent}%`;
      readingProgress.setAttribute("aria-valuenow", String(Math.round(percent)));
    }

    function renderNextBatch() {
        if (isLoading) return;

        const start = (currentPage - 1) * PAGE_SIZE;
        const end = currentPage * PAGE_SIZE;
        const batch = filteredPosts.slice(start, end);

        if (batch.length === 0) {
            if (loader.parentNode) loader.remove();
            return;
        }

        isLoading = true;

        if (loader.parentNode) {
            loader.remove();
        }

        batch.forEach((post, index) => {
            const card = createPostCard(post);
            card.dataset.postIndex = String(start + index + 1);
            postsFeed.appendChild(card);
        });

        currentPage++;
        isLoading = false;

        if (end < filteredPosts.length) {
            postsFeed.appendChild(loader);
    }
        updateReadingProgress();
}

  function initCategory(category = "All") {
    currentCategory = category;
    currentPage = 1;
    postsFeed.innerHTML = "";
    filteredPosts = getFilteredPosts(category);
    updateReadingProgress();

    updateMetaForSeo(category);
    updateStructuredData(filteredPosts);

    if (filteredPosts.length === 0) {
      postsFeed.innerHTML = `<p style="text-align:center; padding:40px; color:#64748b;">${postSearchInput.value.trim() ? "ამ ძიებით პოსტები ვერ მოიძებნა." : "ამ კატეგორიაში პოსტები არ არის."}</p>`;
      return;
    }

    renderNextBatch();
    }

    window.addEventListener("scroll", () => {
        updateReadingProgress();
        if (isLoading) return;

        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

        if (scrollTop + clientHeight >= scrollHeight - 300) {
            renderNextBatch();
    }
});

  function scrollToHashPost() {
    const hash = window.location.hash;

    if (!hash) return;

    let targetId = hash.substring(1);
    try { targetId = decodeURIComponent(targetId); } catch { /* Keep the raw fragment. */ }
    const targetPost = posts.find(post => String(post.id) === targetId);

    if (!targetPost) { history.replaceState(null, "", window.location.pathname); initCategory("All"); return;}

    prioritizePostImage(targetPost);

    if (currentCategory !== "All" && targetPost.category !== currentCategory) {
      tabButtons.forEach(button => button.classList.remove("active"));

      const allTab = document.querySelector('.tab-btn[data-category="All"]');

      if (allTab) {
        allTab.classList.add("active");
      }

      initCategory("All");
    }

    const postIndex = filteredPosts.findIndex(post => String(post.id) === targetId);

    if (postIndex !== -1) {
      const requiredPage = Math.ceil((postIndex + 1) / PAGE_SIZE);

      while (currentPage <= requiredPage) {
        renderNextBatch();
      }

      setTimeout(() => {
        const element = document.getElementById(targetId);

        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
          element.classList.add("highlighted");

          setTimeout(() => {
            element.classList.remove("highlighted");
          }, 2500);
        }
      }, 200);
    }
  }

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      tabButtons.forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      initCategory(button.getAttribute("data-type"));
    });
  });

  postSearchInput.addEventListener("input", () => {
    postSearchClear.hidden = postSearchInput.value.length === 0;
    tabButtons.forEach(button => {
      button.classList.toggle("active", button.getAttribute("data-type") === "All");
    });
    initCategory("All");
  });

  postSearchClear.addEventListener("click", () => {
    postSearchInput.value = "";
    postSearchClear.hidden = true;
    postSearchInput.focus();
    initCategory(currentCategory);
  });

  initCategory("All");
  scrollToHashPost();

  window.addEventListener("hashchange", scrollToHashPost);
});

const scrollBtn = document.getElementById("scrollToTopBtn");

window.addEventListener("scroll", () => {
  if (window.scrollY > 300) {
    scrollBtn.classList.add("show");
  } else {
    scrollBtn.classList.remove("show");
  }
});

scrollBtn.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});
