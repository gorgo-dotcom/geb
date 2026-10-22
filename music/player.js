(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  // Change only this setting when MP3s move online (for example, to a CDN).
  // Current layout: music/mp3/<category>/<file>.mp3
  const MUSIC_BASE_URL = './mp3/';
  const audio = $('audioPlayer');
  const state = { categories: [], category: 0, track: null, showFavorites: false, shuffle: false, repeat: 'off', history: [], favorites: new Set(), context: null, analyser: null, source: null, raf: 0, speed: 1 };
  const favoritesKey = 'geb-audio-favorites-v1';
  const savedVolumeSetting = localStorage.getItem('geb-audio-volume');
  const savedVolume = savedVolumeSetting === null ? 0.8 : Number(savedVolumeSetting);
  // A zero saved by an earlier silent-player version should not leave playback muted.
  audio.volume = Number.isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 1 ? savedVolume : 0.8;
  $('volumeSlider').value = audio.volume;
  let lastAudibleVolume = audio.volume > 0 ? audio.volume : 0.8;

  function syncMuteButton() {
    const muted = audio.muted || audio.volume === 0;
    $('muteButton').classList.toggle('active', muted);
    $('muteButton').setAttribute('aria-pressed', String(muted));
    $('muteButton').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    $('muteButton').title = muted ? 'Unmute (M)' : 'Mute (M)';
  }
  syncMuteButton();

  const currentCategory = () => state.categories[state.category];
  const currentTrack = () => currentCategory()?.tracks[state.track] || null;
  const allTracks = () => state.categories.flatMap((c, ci) => c.tracks.map((track, ti) => ({ ...track, categoryIndex: ci, trackIndex: ti, categoryLabel: c.label })));
  const fileTitle = (track) => track.title || decodeURIComponent(track.path.split('/').pop()).replace(/\.mp3$/i, '');
  const splitArtist = (title) => {
    const parts = title.replace(/^\d+\s*[-. ]\s*/, '').split(/\s+-\s+/);
    return parts.length > 1 ? { artist: parts.shift(), title: parts.join(' - ') } : { artist: 'GEB MUSIC LIBRARY', title: parts[0] };
  };
  const formatTime = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` : '--:--';
  const safePath = (path) => path.split('/').map(encodeURIComponent).join('/');
  const audioUrl = (path) => new URL(safePath(path), new URL(MUSIC_BASE_URL, document.baseURI)).href;

  function renderCategories() {
    const container = $('categoryTabs');
    container.replaceChildren();
    state.categories.forEach((category, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `category-tab${!state.showFavorites && index === state.category ? ' active' : ''}`;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(!state.showFavorites && index === state.category));
      const shortLabel = category.id === 'Techno-Trance' ? 'Techno' : category.id === 'Relax-Ambient-Chill-WorkMusic' ? 'Chill' : category.label;
      const hintLabel = category.id === 'Techno-Trance' ? 'Techno / Trance' : category.id === 'Relax-Ambient-Chill-WorkMusic' ? 'Ambient / Downtempo / Relax / Working music' : category.label;
      button.textContent = `${shortLabel} · ${category.tracks.length}`;
      button.title = hintLabel;
      button.addEventListener('click', () => { state.showFavorites = false; state.category = index; state.track = category.tracks.length ? 0 : null; state.history = []; $('trackSearch').value = ''; renderCategories(); renderTracks(); if (state.track !== null) loadAndPlay(); else updateTrackInfo(); });
      container.append(button);
    });
    $('favoritesTab').classList.toggle('active', state.showFavorites);
    $('favoritesTab').setAttribute('aria-pressed', String(state.showFavorites));
    $('favoriteCount').textContent = state.favorites.size;
  }

  function visibleTracks() {
    const query = $('trackSearch').value.trim().toLocaleLowerCase();
    const tracks = state.showFavorites
      ? allTracks().filter((track) => state.favorites.has(track.path)).map((track) => ({ track, index: track.trackIndex, categoryIndex: track.categoryIndex }))
      : currentCategory().tracks.map((track, index) => ({ track, index, categoryIndex: state.category }));
    return tracks.filter(({ track }) => !query || fileTitle(track).toLocaleLowerCase().includes(query));
  }

  function renderTracks() {
    const list = $('trackList'); list.replaceChildren();
    const items = visibleTracks();
    $('playlistTitle').textContent = state.showFavorites ? 'FAVORITES' : currentCategory().label.toLocaleUpperCase();
    $('playlistCount').textContent = `${items.length} TRACK${items.length === 1 ? '' : 'S'}`;
    $('clearSearch').hidden = !$('trackSearch').value;
    $('emptyState').hidden = items.length !== 0;
    const query = $('trackSearch').value.trim();
    $('emptyState').querySelector('strong').textContent = state.showFavorites ? (query ? 'No matching favorites' : 'No favorites yet') : 'No tracks found';
    $('emptyState').lastElementChild.textContent = state.showFavorites && !query ? 'Tap the heart on a track to save it here.' : 'Try another title or clear your search.';
    items.forEach(({ track, index, categoryIndex }, visibleIndex) => {
      const category = state.categories[categoryIndex];
      const isCurrent = categoryIndex === state.category && index === state.track;
      const row = document.createElement('button'); row.type = 'button'; row.className = `track-row${isCurrent ? ' active' : ''}${isCurrent && !audio.paused ? ' is-playing' : ''}`;
      row.setAttribute('role', 'listitem'); row.setAttribute('aria-current', String(isCurrent));
      const number = document.createElement('span'); number.className = 'track-index'; number.textContent = String(state.showFavorites ? visibleIndex + 1 : index + 1).padStart(2, '0');
      const playing = document.createElement('span'); playing.className = 'track-playing'; playing.textContent = '♫';
      const thumb = document.createElement('img'); thumb.className = 'track-thumb'; thumb.alt = ''; thumb.loading = 'lazy';
      thumb.src = `${new URL(safePath(track.thumbnail || category.thumbnail || track.artwork || category.artwork), document.baseURI).href}?v=thumb2`;
      thumb.addEventListener('error', () => { thumb.hidden = true; }, { once: true });
      const copy = document.createElement('span'); copy.className = 'track-copy';
      const title = document.createElement('span'); title.className = 'track-name'; title.textContent = fileTitle(track);
      const categoryLine = document.createElement('span'); categoryLine.className = 'track-category'; categoryLine.textContent = category.label;
      const duration = document.createElement('span'); duration.className = 'track-duration'; duration.textContent = index === state.track ? formatTime(audio.duration) : 'MP3';
      copy.append(title, categoryLine); row.append(number, playing, thumb, copy, duration);
      row.addEventListener('click', () => { state.category = categoryIndex; state.track = index; renderCategories(); loadAndPlay(); }); list.append(row);
    });
    $('trackCount').textContent = allTracks().length;
    $('footerTrackCount').textContent = allTracks().length;
  }

  function updateTrackInfo() {
    const category = currentCategory(); const track = currentTrack();
    $('artCategory').textContent = category?.label.toLocaleUpperCase() || 'GEB AUDIO';
    $('artMood').textContent = category?.label.toLocaleUpperCase() || 'A LITTLE SPACE TO LISTEN';
    $('coverArt').src = track?.artwork ? `${new URL(safePath(track.artwork), document.baseURI).href}?v=mobile-readability1` : (category?.artwork || 'arts/ambient.svg');
    $('coverArt').alt = track ? `${fileTitle(track)} cover art` : `${category?.label || 'GEB'} category artwork`;
    const artworkPath = track?.artwork?.split('?')[0].toLowerCase() || '';
    $('artworkStage').classList.toggle('has-animated-art', artworkPath.endsWith('.gif'));
    $('artworkStage').dataset.art = category?.id || 'ambient';
    $('nowPlayingHeading').textContent = track ? 'Selected for you' : 'Your listening room';
    if (!track) { $('trackArtist').textContent = 'GEB MUSIC LIBRARY'; $('trackTitle').textContent = 'Choose a track'; $('trackAlbum').textContent = 'Select a category to begin'; }
    else { const parsed = splitArtist(fileTitle(track)); $('trackArtist').textContent = parsed.artist; $('trackTitle').textContent = parsed.title; $('trackAlbum').textContent = category.label; }
    const favorite = track && state.favorites.has(track.path);
    $('favoriteButton').classList.toggle('active', !!favorite); $('favoriteButton').setAttribute('aria-pressed', String(!!favorite));
    $('currentTime').textContent = '00:00'; $('duration').textContent = '--:--'; $('seekBar').value = 0;
    updateMediaSession();
  }

  async function loadAndPlay() {
    const track = currentTrack(); if (!track) return;
    audio.pause(); audio.src = audioUrl(track.path); audio.load(); updateTrackInfo(); renderTracks();
    $('playerMessage').textContent = `Loading ${fileTitle(track)}…`; $('playerMessage').classList.remove('error');
    try { await audio.play(); } catch (error) { $('playerMessage').textContent = `Could not play this track: ${error.message}`; $('playerMessage').classList.add('error'); }
  }

  function setPlaying(playing) {
    $('playPause').classList.toggle('is-playing', playing);
    $('playPause').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('playStateLabel').textContent = playing ? 'PLAYING' : (currentTrack() ? 'PAUSED' : 'STANDBY');
    $('artworkStage').classList.toggle('is-playing', playing);
    $('playerMessage').textContent = playing ? 'Now playing' : 'Playback paused';
    renderTracks(); updateMediaSession();
    if (playing) startVisualizer(); else stopVisualizer();
  }

  async function togglePlay() {
    if (!currentTrack()) { state.track = 0; await loadAndPlay(); return; }
    if (audio.paused) { if (!audio.src) audio.src = audioUrl(currentTrack().path); try { await audio.play(); } catch (error) { $('playerMessage').textContent = error.message; $('playerMessage').classList.add('error'); } }
    else audio.pause();
  }

  function nextTrack(direction = 1) {
    const tracks = currentCategory().tracks; if (!tracks.length) return;
    if (state.shuffle && direction > 0 && tracks.length > 1) {
      state.history.push(state.track ?? 0); let next = state.track;
      while (next === state.track) next = Math.floor(Math.random() * tracks.length);
      state.track = next;
    } else if (direction < 0 && state.shuffle && state.history.length) state.track = state.history.pop();
    else { let next = (state.track ?? (direction > 0 ? -1 : 0)) + direction; if (next < 0) next = state.repeat === 'all' ? tracks.length - 1 : 0; if (next >= tracks.length) next = state.repeat === 'all' ? 0 : tracks.length - 1; state.track = next; }
    loadAndPlay();
  }

  function changeCategory(direction) {
    if (!state.categories.length) return;
    state.category = (state.category + direction + state.categories.length) % state.categories.length;
    state.track = state.categories[state.category].tracks.length ? 0 : null; state.history = [];
    $('trackSearch').value = ''; renderCategories(); renderTracks(); loadAndPlay();
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const track = currentTrack(); if (!track || !('MediaMetadata' in window)) return;
    const parsed = splitArtist(fileTitle(track));
    const coverPath = track.artwork || currentCategory().artwork;
    const imageType = coverPath.toLowerCase().endsWith('.gif') ? 'image/gif' : coverPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/svg+xml';
    navigator.mediaSession.metadata = new MediaMetadata({ title: parsed.title, artist: parsed.artist, album: currentCategory().label, artwork: [{ src: new URL(safePath(coverPath), document.baseURI).href, sizes: '512x512', type: imageType }] });
  }

  async function startVisualizer() {
    const canvas = $('visualizer'); const ctx = canvas.getContext('2d'); if (!ctx) return;
    cancelAnimationFrame(state.raf);
    const draw = () => {
      const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
      const bars = 48; const gap = 3; const width = Math.max(2, (rect.width - gap * (bars - 1)) / bars); const phase = performance.now() / 360;
      for (let i = 0; i < bars; i++) { const wave = (Math.sin(phase + i * .47) + Math.sin(phase * .63 + i * .19) + 2) / 4; const height = Math.max(3, wave * rect.height * .62); const x = i * (width + gap); const grad = ctx.createLinearGradient(0, rect.height, 0, rect.height - height); grad.addColorStop(0, '#789c53'); grad.addColorStop(1, '#5b9995'); ctx.fillStyle = grad; ctx.fillRect(x, rect.height - height, width, height); }
      state.raf = requestAnimationFrame(draw);
    }; draw();
  }

  function stopVisualizer() { cancelAnimationFrame(state.raf); const canvas = $('visualizer'); const ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }

  $('playPause').addEventListener('click', togglePlay);
  $('previousTrack').addEventListener('click', () => { if (audio.currentTime > 3) { audio.currentTime = 0; if (audio.paused) togglePlay(); } else nextTrack(-1); });
  $('nextTrack').addEventListener('click', () => nextTrack(1));
  $('previousCategory').addEventListener('click', () => changeCategory(-1));
  $('nextCategory').addEventListener('click', () => changeCategory(1));
  $('shuffleButton').addEventListener('click', () => { state.shuffle = !state.shuffle; $('shuffleButton').classList.toggle('active', state.shuffle); $('shuffleButton').setAttribute('aria-pressed', String(state.shuffle)); });
  $('repeatButton').addEventListener('click', () => { state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off'; $('repeatButton').dataset.mode = state.repeat; $('repeatLabel').textContent = `REPEAT ${state.repeat.toUpperCase()}`; $('repeatButton').classList.toggle('active', state.repeat !== 'off'); $('repeatButton').setAttribute('aria-pressed', String(state.repeat !== 'off')); $('repeatButton').title = `Repeat: ${state.repeat} (R)`; });
  $('speedButton').addEventListener('click', () => { const speeds = [0.75, 1, 1.25, 1.5, 2]; state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length]; audio.playbackRate = state.speed; $('speedButton').textContent = `${state.speed.toFixed(2).replace(/0$/, '')}×`; });
  $('seekBar').addEventListener('input', () => { if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Number($('seekBar').value) / 1000; });
  $('volumeSlider').addEventListener('input', () => { const newVolume = Number($('volumeSlider').value); if (newVolume > 0) lastAudibleVolume = newVolume; audio.volume = newVolume; audio.muted = false; localStorage.setItem('geb-audio-volume', audio.volume); syncMuteButton(); });
  $('muteButton').addEventListener('click', () => { if (audio.muted || audio.volume === 0) { if (audio.volume === 0) { audio.volume = lastAudibleVolume; $('volumeSlider').value = audio.volume; } audio.muted = false; } else { lastAudibleVolume = audio.volume; audio.muted = true; } syncMuteButton(); });
  $('favoriteButton').addEventListener('click', () => { const track = currentTrack(); if (!track) return; if (state.favorites.has(track.path)) state.favorites.delete(track.path); else state.favorites.add(track.path); localStorage.setItem(favoritesKey, JSON.stringify([...state.favorites])); updateTrackInfo(); renderCategories(); renderTracks(); });
  $('favoritesTab').addEventListener('click', () => { state.showFavorites = !state.showFavorites; $('trackSearch').value = ''; renderCategories(); renderTracks(); });
  $('trackSearch').addEventListener('input', renderTracks);
  $('clearSearch').addEventListener('click', () => { $('trackSearch').value = ''; renderTracks(); $('trackSearch').focus(); });
  audio.addEventListener('play', () => setPlaying(true)); audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('timeupdate', () => { $('currentTime').textContent = formatTime(audio.currentTime); $('seekBar').value = Number.isFinite(audio.duration) && audio.duration ? Math.round(audio.currentTime / audio.duration * 1000) : 0; });
  audio.addEventListener('loadedmetadata', () => { $('duration').textContent = formatTime(audio.duration); renderTracks(); });
  audio.addEventListener('ended', () => { if (state.repeat === 'one') { audio.currentTime = 0; audio.play(); } else if (state.track < currentCategory().tracks.length - 1 || state.repeat === 'all' || state.shuffle) nextTrack(1); else setPlaying(false); });
  audio.addEventListener('error', () => { if (audio.error) { $('playerMessage').textContent = `Audio could not be loaded (${audio.error.code}). Check that this MP3 is available.`; $('playerMessage').classList.add('error'); } });
  window.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
    else if (event.key.toLowerCase() === 'j') nextTrack(-1); else if (event.key.toLowerCase() === 'l') nextTrack(1);
    else if (event.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); }
    else if (event.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 5); }
    else if (event.key.toLowerCase() === 'm') $('muteButton').click(); else if (event.key.toLowerCase() === 's') $('shuffleButton').click(); else if (event.key.toLowerCase() === 'r') $('repeatButton').click(); else if (event.key === '/') { event.preventDefault(); $('trackSearch').focus(); }
  });
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.setActionHandler('play', togglePlay); navigator.mediaSession.setActionHandler('pause', () => audio.pause()); navigator.mediaSession.setActionHandler('previoustrack', () => nextTrack(-1)); navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(1)); navigator.mediaSession.setActionHandler('seekto', (event) => { if (Number.isFinite(event.seekTime)) audio.currentTime = event.seekTime; }); } catch { /* Some browsers expose only part of the Media Session API. */ }
  }

  const embeddedLibrary = $('musicLibrary')?.textContent.trim();
  const libraryRequest = fetch('./library.json', { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error(`Library request failed: ${response.status}`); return response.json(); })
    .catch((error) => {
      if (embeddedLibrary) return JSON.parse(embeddedLibrary);
      throw error;
    });
  libraryRequest.then((library) => {
    state.categories = library.categories || [];
    state.favorites = new Set(JSON.parse(localStorage.getItem(favoritesKey) || '[]'));
    const availableFavorites = new Set(allTracks().map((track) => track.path));
    state.favorites = new Set([...state.favorites].filter((path) => availableFavorites.has(path)));
    localStorage.setItem(favoritesKey, JSON.stringify([...state.favorites]));
    $('libraryStatus').textContent = `${allTracks().length} TRACKS READY`;
    if (!state.categories.length) throw new Error('The library has no categories.');
    state.category = Math.max(0, state.categories.findIndex((category) => category.tracks.length)); state.track = state.categories[state.category].tracks.length ? 0 : null;
    renderCategories(); renderTracks(); updateTrackInfo();
    if (currentTrack()) audio.src = audioUrl(currentTrack().path);
    $('playerMessage').textContent = 'Select a playlist row to play, or press PLAY for the highlighted first track.';
  }).catch((error) => { $('libraryStatus').textContent = 'LIBRARY UNAVAILABLE'; $('playerMessage').textContent = error.message; $('playerMessage').classList.add('error'); });
})();
