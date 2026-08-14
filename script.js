document.addEventListener("DOMContentLoaded", () => {
  const postsFeed = document.getElementById("postsFeed");
  const tabButtons = document.querySelectorAll(".tab-btn");

const PAGE_SIZE = 15;
let currentCategory = "All";
let currentPage = 1;
let isLoading = false;
let filteredPosts = [];
let speechEnabled = false;
let currentSpeechCard = null;
let currentUtterance = null;

  // Add an internal ID without changing the data stored in posts.js.
  posts.forEach((post, index) => {
    post.id = post.id || `post-${index + 1}`;
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

    const mediaHTML = imageUrl
      ? `
        <div class="post-media">
          <img src="${imageUrl}" alt="${post.category} - ${post.content.substring(0, 30)}" itemprop="image" loading="lazy">
          <span class="post-category-tag" data-type="${post.category}" itemprop="articleSection">${post.category}</span>
        </div>
      `
      : `
        <div class="post-media post-media-no-image">
          <span class="post-category-tag" data-type="${post.category}" itemprop="articleSection">${post.category}</span>
        </div>
      `;

       const dateHTML = post.type == 10 && post.createdDate ? `<span class="post-date">📅 <time itemprop="datePublished" datetime="${post.createdDate}">${post.createdDate}</time></span>`: "";

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
          <div class="post-share">
            <a href="https://www.facebook.com/sharer/sharer.php?u=${shareURL}" target="_blank" rel="noopener noreferrer" class="share-btn fb" title="Facebook-ზე გაზიარება">
              <svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <button class="share-btn copy" data-id="${post.id}" title="ლინკის დაკოპირება">
              <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1-.9 2-2-2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            </button>
            <button class="share-btn speech" data-id="${post.id}" title="ხმის წაკითხვის ჩართვა/გამორთვა" aria-label="ხმის წაკითხვის ჩართვა/გამორთვა">
                <svg class="speech-icon-play" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                <svg class="speech-icon-stop" viewBox="0 0 24 24">
                    <path d="M6 6h12v12H6z"/>
                </svg>
            </button>
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


      const speechButton = card.querySelector(".share-btn.speech");
      speechButton.addEventListener("click", (e) => {
          e.preventDefault();
          speechEnabled = !speechEnabled;
          if (!speechEnabled) {
              stopSpeech();
              speechButton.classList.remove("active");
              return;
          }
          speechButton.classList.add("active");
          if (isCardInCenter(card)) {
              speakPost(post, card);
          }
      });
      setupSpeechObserver(card, post);

    return card;
  }

    //---SPEECH READING FUNCTIONS---//
function stopSpeech() 
{
    window.speechSynthesis.cancel();

    speechChunks = [];
    speechChunkIndex = 0;
    speechPost = null;

    if (speechCard) {
        speechCard.classList.remove("speaking");

        const button = speechCard.querySelector(".share-btn.speech");

        if (button) {
            button.classList.remove("active");
        }
    }

        speechCard = null;
}
 function finishSpeech() 
{
        if (speechCard) {
            speechCard.classList.remove("speaking");

            const button = speechCard.querySelector(".share-btn.speech");

            if (button) {
                button.classList.remove("active");
            }
        }

        speechChunks = [];
        speechChunkIndex = 0;
        speechPost = null;
    speechCard = null;
}


let speechChunks = [];
let speechChunkIndex = 0;
let speechPost = null;
let speechCard = null;

function speakPost(post, card) 
{
        if (!speechEnabled || !("speechSynthesis" in window)) {
            return;
        }

        if (speechCard === card && window.speechSynthesis.speaking) {
            return;
        }

        stopSpeech();

        const text = post.content?.trim();

        if (!text) {
            return;
    }

    speechChunks = [text];

    // speechChunks = text
    //     .split(/(?<=[,.!?;:])\s+/)
    //     .map(x => x.trim())
    // .filter(Boolean);

        speechChunkIndex = 0;
        speechPost = post;
        speechCard = card;

        card.classList.add("speaking");

    speakNextChunk();
    }

function speakNextChunk() 
{
        if (!speechEnabled || !speechPost || !speechCard) {
            return;
        }

        if (speechChunkIndex >= speechChunks.length) {
            finishSpeech();
            return;
        }

        const text = speechChunks[speechChunkIndex];

        const utterance = new SpeechSynthesisUtterance(text);

        utterance.lang = "ka-GE";
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onend = () => {
            speechChunkIndex++;

            setTimeout(() => {
                speakNextChunk();
            }, 200);
    };

    utterance.onerror = () => {finishSpeech();};

    window.speechSynthesis.speak(utterance);
}

    function isCardInCenter(card) {
        const rect = card.getBoundingClientRect();
        const center = window.innerHeight / 2;

        return rect.top <= center && rect.bottom >= center;
    }


    function setupSpeechObserver(card, post) {
        let wasInCenter = false;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (!speechEnabled) {
                        wasInCenter = entry.isIntersecting;
                        return;
                    }

                    const inCenter = entry.isIntersecting;

                    if (inCenter && !wasInCenter) {
                        speakPost(post, card);
                    }

                    wasInCenter = inCenter;
                });
            },
            {
                root: null,

                // მხოლოდ ეკრანის ცენტრალურ 20%-იან ზონას ვაკვირდებით
                rootMargin: "-40% 0px -40% 0px",

                threshold: 0
            }
        );

    observer.observe(card);
    }
//---SPEECH READING FUNCTIONS END---//


	function getFilteredPosts(type) {
	  return posts.filter(post =>
		type === "All" || post.type == type
	  );
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

        batch.forEach(post => {
            postsFeed.appendChild(createPostCard(post));
        });

        currentPage++;
        isLoading = false;

        if (end < filteredPosts.length) {
            postsFeed.appendChild(loader);
    }
}

  function initCategory(category = "All") {
    currentCategory = category;
    currentPage = 1;
    postsFeed.innerHTML = "";
    filteredPosts = getFilteredPosts(category);

    updateMetaForSeo(category);
    updateStructuredData(filteredPosts);

    if (filteredPosts.length === 0) {
      postsFeed.innerHTML = `<p style="text-align:center; padding:40px; color:#64748b;">ამ კატეგორიაში პოსტები არ არის.</p>`;
      return;
    }

    renderNextBatch();
    }

    window.addEventListener("scroll", () => {
        if (isLoading) return;

        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

        if (scrollTop + clientHeight >= scrollHeight - 300) {
            renderNextBatch();
    }
});

  function scrollToHashPost() {
    const hash = window.location.hash;

    if (!hash) return;

    const targetId = hash.substring(1);
    const targetPost = posts.find(post => post.id === targetId);

    if (!targetPost) { history.replaceState(null, "", window.location.pathname); initCategory("All"); return;}

    if (currentCategory !== "All" && targetPost.category !== currentCategory) {
      tabButtons.forEach(button => button.classList.remove("active"));

      const allTab = document.querySelector('.tab-btn[data-category="All"]');

      if (allTab) {
        allTab.classList.add("active");
      }

      initCategory("All");
    }

    const postIndex = filteredPosts.findIndex(post => post.id === targetId);

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
