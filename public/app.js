/**
 * Nebula Stream - 播放器前端核心邏輯
 */

document.addEventListener('DOMContentLoaded', () => {
  // === 狀態管理 ===
  let songs = []; // 所有上傳歌曲
  let playlists = []; // 所有歌單
  let currentPlaylist = null; // 目前選取的歌單物件 (null 表示「所有歌曲」)
  let currentSong = null; // 目前播放中的歌曲物件
  let playQueue = []; // 目前播放序列
  let queueIndex = -1; // 目前播放歌曲的索引
  let isPlaying = false;
  let isShuffle = false;
  let repeatMode = 'off'; // 'off' | 'all' | 'one'
  let selectedSongIds = []; // 儲存已勾選的歌曲 ID
  
  // Web Audio Visualizer 變數
  let audioCtx = null;
  let analyser = null;
  let dataArray = null;
  let animationId = null;

  // === UI 元素選擇器 ===
  const audioPlayer = document.getElementById('audio-player');
  const videoPlayer = document.getElementById('video-player');
  const videoContainer = document.getElementById('video-container');
  const btnCloseVideo = document.getElementById('btn-close-video');
  
  const currentTitle = document.getElementById('current-title');
  const currentArtist = document.getElementById('current-artist');
  const coverImg = document.getElementById('cover-img');
  const albumCover = document.getElementById('album-cover');
  const coverIconDefault = document.querySelector('.cover-icon-default');
  const visualizerContainer = document.getElementById('visualizer-container');
  const canvas = document.getElementById('visualizer-canvas');
  const ctx = canvas.getContext('2d');

  // 控制按鈕
  const btnPlayPause = document.getElementById('btn-play-pause');
  const iconPlay = document.getElementById('icon-play');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnShuffle = document.getElementById('btn-shuffle');
  const btnRepeat = document.getElementById('btn-repeat');
  const selectSpeed = document.getElementById('select-speed');

  // 進度條與音量
  const progressWrapper = document.getElementById('progress-wrapper');
  const progressBar = document.getElementById('progress-bar');
  const progressKnob = document.getElementById('progress-knob');
  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');
  
  const btnMute = document.getElementById('btn-mute');
  const iconVolume = document.getElementById('icon-volume');
  const volumeWrapper = document.getElementById('volume-wrapper');
  const volumeBar = document.getElementById('volume-bar');

  // 歌單與清單面板
  const btnAllSongs = document.getElementById('btn-all-songs');
  const playlistsList = document.getElementById('playlists-list');
  const btnNewPlaylist = document.getElementById('btn-new-playlist');
  const playlistCreateBox = document.getElementById('playlist-create-box');
  const inputPlaylistName = document.getElementById('input-playlist-name');
  const btnSavePlaylist = document.getElementById('btn-save-playlist');
  const btnCancelPlaylist = document.getElementById('btn-cancel-playlist');
  
  const playlistTitle = document.getElementById('playlist-title');
  const songsCount = document.getElementById('songs-count');
  const btnSharePlaylist = document.getElementById('btn-share-playlist');
  const btnDeletePlaylist = document.getElementById('btn-delete-playlist');
  const songsListBody = document.getElementById('songs-list-body');
  const searchInput = document.getElementById('search-input');

  // 上傳區
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const btnUploadTrigger = document.getElementById('btn-upload-trigger');
  const uploadModal = document.getElementById('upload-modal');
  const btnCloseUploadModal = document.getElementById('btn-close-upload-modal');
  const uploadProgressList = document.getElementById('upload-progress-list');

  // 下拉選單與 Toast
  const playlistDropdownMenu = document.getElementById('playlist-dropdown-menu');
  const toastContainer = document.getElementById('toast-container');

  // 儲存容量 UI 元素
  const storageRatio = document.getElementById('storage-ratio');
  const storageFill = document.getElementById('storage-fill');
  const storageUsed = document.getElementById('storage-used');
  const storageTotal = document.getElementById('storage-total');

  // 手機版 UI 元素
  const mobileMiniPlayer = document.getElementById('mobile-mini-player');
  const miniTitle = document.getElementById('mini-title');
  const miniArtist = document.getElementById('mini-artist');
  const btnMiniPlayPause = document.getElementById('btn-mini-play-pause');
  const btnMiniNext = document.getElementById('btn-mini-next');
  const mobileTabBar = document.getElementById('mobile-tab-bar');
  const appContainer = document.querySelector('.app-container');

  // 批量刪除 UI 元素
  const chkSelectAll = document.getElementById('chk-select-all');
  const btnBatchDelete = document.getElementById('btn-batch-delete');
  const selectedCountSpan = document.getElementById('selected-count');
  
  // 歌單重命名與手機上傳 UI 元素
  const btnEditPlaylist = document.getElementById('btn-edit-playlist');
  const btnMobileSidebarUpload = document.getElementById('btn-mobile-sidebar-upload');

  // 歌詞相關 UI 元素
  const btnToggleLyrics = document.getElementById('btn-toggle-lyrics');
  const lyricsWrapper = document.getElementById('lyrics-wrapper');
  const lyricsContainer = document.getElementById('lyrics-container');
  const btnEditLyrics = document.getElementById('btn-edit-lyrics');
  const lyricsModal = document.getElementById('lyrics-modal');
  const btnCloseLyricsModal = document.getElementById('btn-close-lyrics-modal');
  const textareaLyrics = document.getElementById('textarea-lyrics');
  const btnCancelLyrics = document.getElementById('btn-cancel-lyrics');
  const btnSaveLyrics = document.getElementById('btn-save-lyrics');
  const coverWrapper = document.getElementById('cover-wrapper');

  let lyricsMode = false;
  let parsedLyrics = [];

  // 儲存音量設定 (預設 0.8)
  let currentVolume = 0.8;
  let isMuted = false;

  // === 初始化 Canvas 大小 ===
  function resizeCanvas() {
    canvas.width = visualizerContainer.clientWidth;
    canvas.height = visualizerContainer.clientHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // === 初始化 Lucide 圖標重新繪製 ===
  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // === API 串接與資料載入 ===
  
  // 載入所有歌曲
  async function fetchSongs() {
    try {
      const res = await fetch('/api/songs');
      songs = await res.json();
      if (!currentPlaylist) {
        renderSongsList(songs);
        playQueue = [...songs];
      }
    } catch (err) {
      console.error('fetchSongs error:', err);
      showToast('載入歌曲庫失敗: ' + err.message, 'error');
    }
  }

  // 載入與更新儲存空間狀態
  async function fetchStorageStatus() {
    try {
      const res = await fetch('/api/storage-status');
      const data = await res.json();
      if (data.success) {
        const usedMB = (data.usedSpace / (1024 * 1024)).toFixed(2);
        const totalMB = (data.totalSpace / (1024 * 1024)).toFixed(2);
        
        let displayTotal = `${totalMB} MB`;
        if (data.totalSpace >= 1024 * 1024 * 1024) {
          displayTotal = `${(data.totalSpace / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
        
        let displayUsed = `${usedMB} MB`;
        if (data.usedSpace >= 1024 * 1024 * 1024) {
          displayUsed = `${(data.usedSpace / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }

        const percentage = Math.min(100, ((data.usedSpace / data.totalSpace) * 100)).toFixed(1);
        
        storageRatio.textContent = `${percentage}%`;
        storageFill.style.width = `${percentage}%`;
        storageUsed.textContent = displayUsed;
        storageTotal.textContent = displayTotal;

        // 如果容量快滿了 (70% 或 90% 以上)，改變進度條與比例字體顏色為紅色或橘色
        if (percentage >= 90) {
          storageRatio.style.color = '#ef4444';
          storageFill.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
        } else if (percentage >= 70) {
          storageRatio.style.color = '#f97316';
          storageFill.style.background = 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)';
        } else {
          storageRatio.style.color = 'var(--accent-light)';
          storageFill.style.background = 'var(--accent-gradient)';
        }
      }
    } catch (err) {
      console.error('取得儲存容量狀態失敗:', err);
    }
  }

  // 載入所有歌單
  async function fetchPlaylists() {
    try {
      const res = await fetch('/api/playlists');
      playlists = await res.json();
      renderPlaylistsSidebar();
    } catch (err) {
      showToast('載入歌單失敗', 'error');
    }
  }

  // 載入單一歌單內容
  async function fetchPlaylistDetails(playlistId) {
    try {
      const res = await fetch(`/api/playlists/${playlistId}`);
      if (!res.ok) throw new Error('歌單不存在');
      const data = await res.json();
      currentPlaylist = data;
      playlistTitle.textContent = data.name;
      renderSongsList(data.songs);
      playQueue = [...data.songs];
      
      // 更新側邊欄 Active 狀態
      document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
      const activeEl = document.querySelector(`[data-playlist-id="${playlistId}"]`);
      if (activeEl) activeEl.classList.add('active');

      // 顯示分享與刪除按鈕
      btnSharePlaylist.classList.remove('hidden');
      btnSharePlaylist.querySelector('span').textContent = '分享此歌單';
      btnDeletePlaylist.classList.remove('hidden');
      btnEditPlaylist.classList.remove('hidden');
    } catch (err) {
      showToast(err.message, 'error');
      loadAllSongsView();
    }
  }

  // 切換回「所有歌曲」視窗
  function loadAllSongsView() {
    currentPlaylist = null;
    playlistTitle.textContent = '所有歌曲';
    btnSharePlaylist.classList.remove('hidden'); // 所有歌曲視角下也顯示分享
    btnSharePlaylist.querySelector('span').textContent = '分享歌曲庫';
    btnDeletePlaylist.classList.add('hidden');
    btnEditPlaylist.classList.add('hidden');
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    btnAllSongs.classList.add('active');
    renderSongsList(songs);
    playQueue = [...songs];
  }

  // === UI 渲染函數 ===

  // 渲染側邊欄歌單
  function renderPlaylistsSidebar() {
    playlistsList.innerHTML = '';
    playlists.forEach(p => {
      const li = document.createElement('li');
      li.className = 'menu-item';
      li.setAttribute('data-playlist-id', p.id);
      li.innerHTML = `
        <i data-lucide="list-music"></i>
        <span>${escapeHtml(p.name)}</span>
      `;
      li.addEventListener('click', () => {
        fetchPlaylistDetails(p.id);
      });
      playlistsList.appendChild(li);
    });
    refreshIcons();
  }

  // 渲染右側歌曲表格
  function renderSongsList(songsToShow) {
    // 重設勾選狀態
    selectedSongIds = [];
    if (chkSelectAll) chkSelectAll.checked = false;
    updateBatchDeleteUI();

    songsCount.textContent = songsToShow.length;
    songsListBody.innerHTML = '';

    if (songsToShow.length === 0) {
      songsListBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7" class="text-center">此歌單內尚無任何音樂/影片，請將歌曲加入或上傳檔案</td>
        </tr>
      `;
      return;
    }

    songsToShow.forEach((song, idx) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-song-id', song.id);
      
      // 檢查是否為目前播放的歌曲
      if (currentSong && currentSong.id === song.id) {
        tr.className = 'playing-row';
      }

      const mediaIcon = song.isVideo ? 'video' : 'music';
      
      tr.innerHTML = `
        <td><input type="checkbox" class="song-checkbox" data-song-id="${song.id}"></td>
        <td>${idx + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="row-play-btn" title="播放">
              <i data-lucide="${currentSong && currentSong.id === song.id && isPlaying ? 'pause' : 'play'}"></i>
            </button>
            <i data-lucide="${mediaIcon}" style="width: 14px; color: var(--text-dark);"></i>
            <span>${escapeHtml(song.title)}</span>
          </div>
        </td>
        <td>${escapeHtml(song.artist)}</td>
        <td>${escapeHtml(song.album || '—')}</td>
        <td>${formatTime(song.duration)}</td>
        <td>
          <div class="song-actions">
            <button class="action-dot-btn btn-add-to-pl" title="更多操作">
              <i data-lucide="more-horizontal"></i>
            </button>
            <button class="action-dot-btn btn-delete-song" title="刪除歌曲" style="color: #ef4444; margin-left: 8px;">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      `.trim();

      // 複選框變更事件
      const checkbox = tr.querySelector('.song-checkbox');
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          const songId = song.id;
          if (e.target.checked) {
            if (!selectedSongIds.includes(songId)) {
              selectedSongIds.push(songId);
            }
          } else {
            selectedSongIds = selectedSongIds.filter(id => id !== songId);
          }
          updateBatchDeleteUI();
        });
      }

      // 點擊整列或播放按鈕
      const playBtn = tr.querySelector('.row-play-btn');
      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleRowPlay(song, songsToShow);
        });
      }

      tr.addEventListener('dblclick', () => {
        handleRowPlay(song, songsToShow);
      });

      // 更多操作選單 (加入歌單 / 移出歌單)
      const dotBtn = tr.querySelector('.btn-add-to-pl');
      if (dotBtn) {
        dotBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showSongContextMenu(e, song);
        });
      }

      // 刪除歌曲按鈕事件
      const deleteBtn = tr.querySelector('.btn-delete-song');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleDeleteSong(song);
        });
      }

      songsListBody.appendChild(tr);
    });
    refreshIcons();
  }

  // 處理清單行播放邏輯
  function handleRowPlay(song, songsContext) {
    // 如果播放的是目前這首歌，點擊則是切換 播放/暫停
    if (currentSong && currentSong.id === song.id) {
      togglePlay();
      return;
    }

    // 更新當前播放序列環境 (如果更換了歌單清單)
    playQueue = [...songsContext];
    queueIndex = playQueue.findIndex(s => s.id === song.id);
    playSong(song);
  }

  // === 播放核心控制邏輯 ===

  // 播放特定歌曲
  function playSong(song) {
    if (!song) return;
    
    // 初始化 AudioContext 視覺化
    initVisualizer();

    currentSong = song;
    currentTitle.textContent = song.title;
    currentArtist.textContent = song.artist;

    // 解析並顯示歌詞
    renderLyrics(song);

    // 處理專輯封面
    if (song.hasCover && song.coverUrl) {
      coverImg.src = song.coverUrl;
      coverImg.classList.remove('hidden');
      coverIconDefault.classList.add('hidden');
    } else {
      coverImg.classList.add('hidden');
      coverIconDefault.classList.remove('hidden');
    }

    // 暫停所有播放器
    audioPlayer.pause();
    videoPlayer.pause();

    // 判斷是音訊還是影片 (MP4)
    if (song.isVideo) {
      videoContainer.classList.remove('hidden');
      videoPlayer.src = song.fileUrl;
      videoPlayer.load();
      videoPlayer.playbackRate = parseFloat(selectSpeed.value);
      videoPlayer.volume = isMuted ? 0 : currentVolume;
      videoPlayer.play().catch(err => console.log('Video play auto-blocked:', err));
    } else {
      videoContainer.classList.add('hidden');
      videoPlayer.src = '';
      audioPlayer.src = song.fileUrl;
      audioPlayer.load();
      audioPlayer.playbackRate = parseFloat(selectSpeed.value);
      audioPlayer.volume = isMuted ? 0 : currentVolume;
      audioPlayer.play().catch(err => console.log('Audio play auto-blocked:', err));
    }

    isPlaying = true;
    updatePlayPauseUI();
    highlightPlayingRow();
    updateMediaSession(song);
    updateMiniPlayerUI();
  }

  // 切換 播放/暫停
  function togglePlay() {
    if (!currentSong) {
      // 若沒選歌曲，預設播放清單第一首
      if (playQueue.length > 0) {
        queueIndex = 0;
        playSong(playQueue[0]);
      }
      return;
    }

    const activePlayer = getActivePlayer();
    
    // 確保啟動 AudioContext
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    if (isPlaying) {
      activePlayer.pause();
      isPlaying = false;
    } else {
      activePlayer.play().catch(err => console.log('Play blocked:', err));
      isPlaying = true;
    }

    updatePlayPauseUI();
    highlightPlayingRow();
    updateMiniPlayerUI();
  }

  // 上一首
  function prevSong() {
    if (playQueue.length === 0) return;
    
    if (isShuffle) {
      queueIndex = Math.floor(Math.random() * playQueue.length);
    } else {
      queueIndex--;
      if (queueIndex < 0) {
        queueIndex = playQueue.length - 1; // 循環到最後一首
      }
    }
    playSong(playQueue[queueIndex]);
  }

  // 下一首 (手動按或自動撥完)
  function nextSong(isAuto = false) {
    if (playQueue.length === 0) return;

    // 單曲循環且自動撥完
    if (isAuto && repeatMode === 'one') {
      playSong(currentSong);
      return;
    }

    if (isShuffle) {
      queueIndex = Math.floor(Math.random() * playQueue.length);
    } else {
      queueIndex++;
      if (queueIndex >= playQueue.length) {
        if (repeatMode === 'all' || !isAuto) {
          queueIndex = 0; // 循環回第一首
        } else {
          // 自動播完且沒有開啟重複播放
          isPlaying = false;
          updatePlayPauseUI();
          return;
        }
      }
    }
    playSong(playQueue[queueIndex]);
  }

  // 取得當前運作的 HTML5 媒體元件
  function getActivePlayer() {
    return currentSong && currentSong.isVideo ? videoPlayer : audioPlayer;
  }

  // 更新播放按鈕 UI
  function updatePlayPauseUI() {
    if (isPlaying) {
      btnPlayPause.innerHTML = '<i data-lucide="pause"></i>';
      albumCover.classList.add('playing');
    } else {
      btnPlayPause.innerHTML = '<i data-lucide="play"></i>';
      albumCover.classList.remove('playing');
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
    refreshIcons();
  }

  // 高亮目前正播放的列
  function highlightPlayingRow() {
    document.querySelectorAll('#songs-list-body tr').forEach(tr => {
      tr.classList.remove('playing-row');
      const rowPlayBtn = tr.querySelector('.row-play-btn');
      if (rowPlayBtn) {
        rowPlayBtn.innerHTML = '<i data-lucide="play"></i>';
      }
      
      if (currentSong && tr.getAttribute('data-song-id') === currentSong.id) {
        tr.classList.add('playing-row');
        if (rowPlayBtn) {
          rowPlayBtn.innerHTML = `<i data-lucide="${isPlaying ? 'pause' : 'play'}"></i>`;
        }
      }
    });
    refreshIcons();
  }

  // === 音訊/影片事件監聽 ===

  const handleTimeUpdate = (e) => {
    const player = e.target;
    if (isNaN(player.duration)) return;
    
    // 更新進度條
    const pct = (player.currentTime / player.duration) * 100;
    progressBar.style.width = `${pct}%`;
    progressKnob.style.left = `${pct}%`;
    
    // 更新文字時間
    timeCurrent.textContent = formatTime(player.currentTime);
    timeDuration.textContent = formatTime(player.duration);

    // 同步歌詞滾動高亮
    if (lyricsMode) {
      syncLyrics(player.currentTime);
    }
  };

  const handleMediaEnded = () => {
    nextSong(true);
  };

  audioPlayer.addEventListener('timeupdate', handleTimeUpdate);
  audioPlayer.addEventListener('ended', handleMediaEnded);
  
  videoPlayer.addEventListener('timeupdate', handleTimeUpdate);
  videoPlayer.addEventListener('ended', handleMediaEnded);

  // 點擊進度條調整時間
  progressWrapper.addEventListener('click', (e) => {
    if (!currentSong) return;
    const player = getActivePlayer();
    if (isNaN(player.duration)) return;

    const rect = progressWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    
    player.currentTime = percentage * player.duration;
  });

  // === 音量與其他控制 ===

  // 點擊調整音量
  volumeWrapper.addEventListener('click', (e) => {
    const rect = volumeWrapper.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    
    currentVolume = percentage;
    isMuted = false;
    
    updateVolumeUI();
  });

  // 靜音切換
  btnMute.addEventListener('click', () => {
    isMuted = !isMuted;
    updateVolumeUI();
  });

  function updateVolumeUI() {
    const player = getActivePlayer();
    const volumeToSet = isMuted ? 0 : currentVolume;
    
    audioPlayer.volume = volumeToSet;
    videoPlayer.volume = volumeToSet;

    // 更新音量條寬度
    volumeBar.style.width = `${volumeToSet * 100}%`;

    // 更新圖示
    if (isMuted || volumeToSet === 0) {
      btnMute.innerHTML = '<i data-lucide="volume-x"></i>';
    } else if (volumeToSet < 0.4) {
      btnMute.innerHTML = '<i data-lucide="volume-1"></i>';
    } else {
      btnMute.innerHTML = '<i data-lucide="volume-2"></i>';
    }
    refreshIcons();
  }

  // 播放速度調整
  selectSpeed.addEventListener('change', (e) => {
    const speed = parseFloat(e.target.value);
    audioPlayer.playbackRate = speed;
    videoPlayer.playbackRate = speed;
  });

  // 隨機播放切換
  btnShuffle.addEventListener('click', () => {
    isShuffle = !isShuffle;
    btnShuffle.classList.toggle('active', isShuffle);
    showToast(isShuffle ? '已開啟隨機播放' : '已關閉隨機播放');
  });

  // 重複播放模式切換
  btnRepeat.addEventListener('click', () => {
    if (repeatMode === 'off') {
      repeatMode = 'all';
      btnRepeat.classList.add('active');
      btnRepeat.setAttribute('title', '全歌單循環');
      btnRepeat.innerHTML = '<i data-lucide="repeat"></i>';
      showToast('已開啟全歌單循環');
    } else if (repeatMode === 'all') {
      repeatMode = 'one';
      btnRepeat.classList.add('active');
      btnRepeat.setAttribute('title', '單曲循環');
      btnRepeat.innerHTML = '<i data-lucide="repeat-1"></i>';
      showToast('已開啟單曲循環');
    } else {
      repeatMode = 'off';
      btnRepeat.classList.remove('active');
      btnRepeat.setAttribute('title', '不循環');
      btnRepeat.innerHTML = '<i data-lucide="repeat"></i>';
      showToast('已關閉循環播放');
    }
    refreshIcons();
  });

  // 主播放/暫停按鈕
  btnPlayPause.addEventListener('click', togglePlay);
  
  // 上一首/下一首按鈕
  btnPrev.addEventListener('click', prevSong);
  btnNext.addEventListener('click', () => nextSong(false));

  // 關閉影片視窗
  btnCloseVideo.addEventListener('click', () => {
    videoContainer.classList.add('hidden');
    // 如果關閉影片，轉回背景音訊播放，這裡我們選擇只暫停影片，
    // 使用者可以在清單上重新播放其他歌曲，或是隱藏容器但繼續播放影片聲音。
    // 這邊我們選擇隱藏容器但繼續播聲音，方便使用者當成背景音訊聽。
    showToast('視訊視窗已隱藏，將繼續播放音訊');
  });

  // === 歌單管理事件 ===

  // 顯示/隱藏建立歌單輸入框
  btnNewPlaylist.addEventListener('click', () => {
    playlistCreateBox.classList.remove('hidden');
    inputPlaylistName.focus();
  });

  btnCancelPlaylist.addEventListener('click', () => {
    playlistCreateBox.classList.add('hidden');
    inputPlaylistName.value = '';
  });

  // 儲存歌單
  btnSavePlaylist.addEventListener('click', async () => {
    const name = inputPlaylistName.value.trim();
    if (!name) {
      showToast('請輸入歌單名稱', 'error');
      return;
    }

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      
      if (data.success) {
        showToast(`歌單「${name}」建立成功！`);
        playlistCreateBox.classList.add('hidden');
        inputPlaylistName.value = '';
        await fetchPlaylists();
      } else {
        showToast(data.error || '建立歌單失敗', 'error');
      }
    } catch (err) {
      showToast('與伺服器連線失敗', 'error');
    }
  });

  // 刪除歌單
  btnDeletePlaylist.addEventListener('click', async () => {
    if (!currentPlaylist) return;
    if (!confirm(`確定要刪除歌單「${currentPlaylist.name}」嗎？`)) return;

    try {
      const res = await fetch(`/api/playlists/${currentPlaylist.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.success) {
        showToast('歌單已成功刪除');
        await fetchPlaylists();
        loadAllSongsView();
      } else {
        showToast(data.error || '刪除歌單失敗', 'error');
      }
    } catch (err) {
      showToast('與伺服器連線失敗', 'error');
    }
  });

  // 更新批量刪除按鈕與計數 UI
  function updateBatchDeleteUI() {
    if (!btnBatchDelete || !selectedCountSpan) return;
    
    const count = selectedSongIds.length;
    selectedCountSpan.textContent = count;
    
    if (count > 0) {
      btnBatchDelete.classList.remove('hidden');
    } else {
      btnBatchDelete.classList.add('hidden');
    }
    
    // 更新表頭「全選」核取方塊的勾選狀態
    if (chkSelectAll) {
      const allRowCheckboxes = songsListBody.querySelectorAll('.song-checkbox');
      if (allRowCheckboxes.length > 0) {
        chkSelectAll.checked = Array.from(allRowCheckboxes).every(cb => cb.checked);
      } else {
        chkSelectAll.checked = false;
      }
    }
  }

  // 全選/取消全選事件監聽
  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      const allRowCheckboxes = songsListBody.querySelectorAll('.song-checkbox');
      
      selectedSongIds = [];
      allRowCheckboxes.forEach(cb => {
        cb.checked = checked;
        const songId = cb.getAttribute('data-song-id');
        if (checked && songId) {
          selectedSongIds.push(songId);
        }
      });
      
      updateBatchDeleteUI();
    });
  }

  // 批量刪除按鈕點擊事件監聽
  if (btnBatchDelete) {
    btnBatchDelete.addEventListener('click', async () => {
      const count = selectedSongIds.length;
      if (count === 0) return;
      
      if (!confirm(`確定要將勾選的 ${count} 首歌曲/影片從伺服器永久刪除嗎？\n這會將它們從所有歌單中移出，且無法復原。`)) {
        return;
      }
      
      try {
        const res = await fetch('/api/songs/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: selectedSongIds })
        });
        const data = await res.json();
        
        if (data.success) {
          showToast(data.message || `已成功批量刪除 ${count} 首歌曲`);
          
          // 如果刪除的歌曲中包含目前正在播放的，則停止播放
          if (currentSong && selectedSongIds.includes(currentSong.id)) {
            audioPlayer.pause();
            videoPlayer.pause();
            currentSong = null;
            isPlaying = false;
            updatePlayPauseUI();
            updateMiniPlayerUI();
            currentTitle.textContent = '未播放歌曲';
            currentArtist.textContent = '請從清單選擇歌曲或上傳新歌';
            coverImg.classList.add('hidden');
            coverIconDefault.classList.remove('hidden');
            videoContainer.classList.add('hidden');
            lyricsContainer.innerHTML = '';
          }
          
          // 重置勾選狀態
          selectedSongIds = [];
          updateBatchDeleteUI();
          
          // 重新整理資料庫與列表
          await fetchSongs();
          await fetchPlaylists();
          await fetchStorageStatus();
          
          if (currentPlaylist) {
            await fetchPlaylistDetails(currentPlaylist.id);
          } else {
            renderSongsList(songs);
            playQueue = [...songs];
          }
        } else {
          showToast(data.error || '批量刪除失敗', 'error');
        }
      } catch (err) {
        showToast('批量刪除發生異常，請檢查網路連線', 'error');
      }
    });
  }

  // 側邊欄「所有歌曲」按鈕
  btnAllSongs.addEventListener('click', loadAllSongsView);

  // 修改歌單名稱按鈕點擊事件
  if (btnEditPlaylist) {
    btnEditPlaylist.addEventListener('click', async () => {
      if (!currentPlaylist) return;
      
      const newName = prompt('請輸入新的歌單名稱：', currentPlaylist.name);
      if (newName === null) return; // 使用者按取消
      
      const trimmedName = newName.trim();
      if (!trimmedName) {
        showToast('歌單名稱不能為空', 'error');
        return;
      }
      if (trimmedName === currentPlaylist.name) return;
      
      try {
        const res = await fetch(`/api/playlists/${currentPlaylist.id}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmedName })
        });
        const data = await res.json();
        
        if (data.success) {
          showToast(`歌單名稱已成功修改為「${trimmedName}」`);
          await fetchPlaylists();
          await fetchPlaylistDetails(currentPlaylist.id);
        } else {
          showToast(data.error || '修改歌單名稱失敗', 'error');
        }
      } catch (err) {
        showToast('與伺服器連線失敗，請稍後再試', 'error');
      }
    });
  }

  // 手機版側邊欄上傳按鈕點擊事件
  if (btnMobileSidebarUpload) {
    btnMobileSidebarUpload.addEventListener('click', () => {
      fileInput.click();
    });
  }

  // === 下拉選單 (加入歌單) 邏輯 ===

  function showSongContextMenu(e, song) {
    const rect = e.currentTarget.getBoundingClientRect();
    playlistDropdownMenu.style.top = `${rect.bottom + window.scrollY}px`;
    playlistDropdownMenu.style.left = `${rect.left - 130 + window.scrollX}px`;
    playlistDropdownMenu.classList.remove('hidden');

    // 建立下拉選單內容
    let html = `<div class="dropdown-header">加入到歌單</div>`;
    
    if (playlists.length === 0) {
      html += `<div class="dropdown-item" style="color: var(--text-dark); cursor: default;">無可用歌單</div>`;
    } else {
      playlists.forEach(pl => {
        html += `
          <div class="dropdown-item item-add-to-playlist" data-playlist-id="${pl.id}" data-song-id="${song.id}">
            <i data-lucide="plus-circle" style="width: 14px;"></i>
            <span>${escapeHtml(pl.name)}</span>
          </div>
        `;
      });
    }

    // 如果目前是在自訂歌單畫面，顯示「從此歌單移除」選項
    if (currentPlaylist) {
      html += `
        <div class="dropdown-divider"></div>
        <div class="dropdown-item item-remove-from-playlist" data-playlist-id="${currentPlaylist.id}" data-song-id="${song.id}" style="color: #f87171;">
          <i data-lucide="minus-circle" style="width: 14px;"></i>
          <span>從此歌單移出</span>
        </div>
      `;
    }

    playlistDropdownMenu.innerHTML = html;
    refreshIcons();

    // 綁定加入歌單事件
    playlistDropdownMenu.querySelectorAll('.item-add-to-playlist').forEach(item => {
      item.addEventListener('click', async () => {
        const plId = item.getAttribute('data-playlist-id');
        const sId = item.getAttribute('data-song-id');
        await addSongToPlaylist(plId, sId);
        playlistDropdownMenu.classList.add('hidden');
      });
    });

    // 綁定移出歌單事件
    if (currentPlaylist) {
      playlistDropdownMenu.querySelector('.item-remove-from-playlist').addEventListener('click', async () => {
        const plId = currentPlaylist.id;
        const sId = song.id;
        await removeSongFromPlaylist(plId, sId);
        playlistDropdownMenu.classList.add('hidden');
      });
    }
  }

  // 點擊頁面其他地方關閉下拉選單
  document.addEventListener('click', () => {
    playlistDropdownMenu.classList.add('hidden');
  });

  // 將歌曲加入歌單
  async function addSongToPlaylist(playlistId, songId) {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId })
      });
      const data = await res.json();
      
      if (data.success) {
        const plName = playlists.find(p => p.id === playlistId)?.name || '歌單';
        showToast(`歌曲已成功加入歌單「${plName}」！`);
      } else {
        showToast(data.error || '加入歌單失敗', 'error');
      }
    } catch (err) {
      showToast('加入歌單失敗，連線異常', 'error');
    }
  }

  // 從歌單移出歌曲
  async function removeSongFromPlaylist(playlistId, songId) {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId })
      });
      const data = await res.json();
      
      if (data.success) {
        showToast('歌曲已從歌單中移出');
        // 重新整理目前歌單畫面
        await fetchPlaylistDetails(playlistId);
      } else {
        showToast(data.error || '移出歌曲失敗', 'error');
      }
    } catch (err) {
      showToast('移出歌曲失敗，連線異常', 'error');
    }
  }

  // === 歌單分享功能 ===

  btnSharePlaylist.addEventListener('click', () => {
    if (!currentPlaylist && songs.length === 0) return;

    // 建立分享連結
    const shareUrl = currentPlaylist 
      ? `${window.location.origin}/?playlist=${currentPlaylist.id}`
      : `${window.location.origin}/`;
    
    // 寫入剪貼簿
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        showToast(currentPlaylist ? '歌單分享連結已複製到剪貼簿！' : '歌曲庫分享連結已複製到剪貼簿！');
      })
      .catch(() => {
        // Fallback 手動複製
        prompt('請手動複製以下分享連結：', shareUrl);
      });
  });

  // 偵測網址參數是否有分享歌單
  async function checkSharedPlaylist() {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedPlaylistId = urlParams.get('playlist');
    
    if (sharedPlaylistId) {
      showToast('正在載入分享的雲端歌單...', 'info');
      try {
        await fetchPlaylistDetails(sharedPlaylistId);
        showToast(`已成功載入分享歌單「${currentPlaylist.name}」！`);
      } catch (err) {
        showToast('載入分享歌單失敗，將載入所有歌曲', 'error');
        loadAllSongsView();
      }
    } else {
      loadAllSongsView();
    }
  }

  // === 搜尋功能 ===
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    
    // 從當前播放清單/視圖篩選
    const currentViewSongs = currentPlaylist ? currentPlaylist.songs : songs;
    
    if (!term) {
      renderSongsList(currentViewSongs);
      return;
    }

    const filtered = currentViewSongs.filter(s => 
      s.title.toLowerCase().includes(term) || 
      s.artist.toLowerCase().includes(term) || 
      (s.album && s.album.toLowerCase().includes(term))
    );

    renderSongsList(filtered);
  });

  // === 檔案上傳控制與拖曳 ===

  // 拖曳處理
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  // 遞迴讀取 DataTransferEntry 裡的所有檔案，並記下所屬子資料夾路徑以自動轉為歌單
  async function traverseFileTree(item, path = "") {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file((file) => {
          const folders = path.split('/').filter(Boolean);
          // 如果有層級路徑，把最接近該檔案的父資料夾名稱作為歌單名稱
          if (folders.length > 0) {
            file.playlistName = folders[folders.length - 1];
          }
          resolve([file]);
        });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const allFiles = [];
        
        // 遞迴讀取 entries，需處理 readEntries 可能分批回傳的情況
        const readEntries = () => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              resolve(allFiles);
            } else {
              const filePromises = entries.map(entry => traverseFileTree(entry, path + item.name + "/"));
              const results = await Promise.all(filePromises);
              allFiles.push(...results.flat());
              readEntries(); // 繼續讀取下一批
            }
          }, (err) => {
            console.error('讀取目錄 entries 失敗:', err);
            resolve(allFiles);
          });
        };
        readEntries();
      } else {
        resolve([]);
      }
    });
  }

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const filePromises = [];
      for (let i = 0; i < items.length; i++) {
        // webkitGetAsEntry 是現代瀏覽器都支援的 API，可用於讀取拖曳的資料夾
        const item = items[i].webkitGetAsEntry();
        if (item) {
          filePromises.push(traverseFileTree(item));
        }
      }
      const results = await Promise.all(filePromises);
      const allFiles = results.flat();
      handleFilesSelected(allFiles);
    } else {
      const files = e.dataTransfer.files;
      handleFilesSelected(files);
    }
  });

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    handleFilesSelected(e.target.files);
  });

  btnUploadTrigger.addEventListener('click', () => {
    fileInput.click();
  });

  btnCloseUploadModal.addEventListener('click', () => {
    uploadModal.classList.add('hidden');
  });

  // 處理選擇檔案上傳
  function handleFilesSelected(fileList) {
    const files = Array.from(fileList).filter(file => {
      const type = file.type;
      return type.startsWith('audio/') || type.startsWith('video/') || file.name.endsWith('.mp3') || file.name.endsWith('.mp4');
    });

    if (files.length === 0) {
      showToast('請選擇正確的 MP3 或 MP4 媒體檔案！', 'error');
      return;
    }

    uploadModal.classList.remove('hidden');
    uploadProgressList.innerHTML = '';

    let completedUploads = 0;
    let successfulUploads = 0;

    files.forEach(file => {
      // 建立進度條 UI
      const item = document.createElement('div');
      item.className = 'progress-item';
      item.innerHTML = `
        <div class="progress-info">
          <span class="progress-name">${escapeHtml(file.name)}</span>
          <span class="progress-percent" id="pct-${escapeHtml(file.name)}">0%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" id="fill-${escapeHtml(file.name)}"></div>
        </div>
      `;
      uploadProgressList.appendChild(item);

      // 執行 AJAX 上傳
      const formData = new FormData();
      formData.append('music', file);
      if (file.playlistName) {
        formData.append('playlistName', file.playlistName);
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);

      // 上傳進度監聽
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          document.getElementById(`pct-${escapeHtml(file.name)}`).textContent = `${pct}%`;
          document.getElementById(`fill-${escapeHtml(file.name)}`).style.width = `${pct}%`;
        }
      });

      xhr.onload = async () => {
        completedUploads++;
        if (xhr.status === 200) {
          successfulUploads++;
          const res = JSON.parse(xhr.responseText);
          document.getElementById(`pct-${escapeHtml(file.name)}`).textContent = '完成';
          document.getElementById(`pct-${escapeHtml(file.name)}`).style.color = '#10b981';
          document.getElementById(`fill-${escapeHtml(file.name)}`).style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else {
          document.getElementById(`pct-${escapeHtml(file.name)}`).textContent = '失敗';
          document.getElementById(`pct-${escapeHtml(file.name)}`).style.color = '#ef4444';
        }

        // 當全部檔案上傳完成
        if (completedUploads === files.length) {
          if (successfulUploads > 0) {
            const failedCount = files.length - successfulUploads;
            showToast(`成功上傳了 ${successfulUploads} 首歌曲/影片！${failedCount > 0 ? `(${failedCount} 首失敗)` : ''}`);
          } else {
            showToast('所有檔案上傳失敗，請檢查檔案大小 (限制 100MB) 或格式', 'error');
          }
          setTimeout(() => {
            uploadModal.classList.add('hidden');
          }, 1500);

          // 重新整理資料庫歌曲列表
          await fetchSongs();
          await fetchPlaylists();
          await fetchStorageStatus();
          
          // 如果當前是在「所有歌曲」視角，重新繪製列表
          if (!currentPlaylist) {
            renderSongsList(songs);
            playQueue = [...songs];
          } else {
            // 如果是在特定歌單中，則更新歌單內容
            await fetchPlaylistDetails(currentPlaylist.id);
          }
        }
      };

      xhr.onerror = () => {
        completedUploads++;
        document.getElementById(`pct-${escapeHtml(file.name)}`).textContent = '連線失敗';
        document.getElementById(`pct-${escapeHtml(file.name)}`).style.color = '#ef4444';
      };

      xhr.send(formData);
    });
  }

  // === Web Audio API 音訊頻譜視覺化 ===

  function initVisualizer() {
    if (audioCtx) return;
    
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
      
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256; // 產生 128 個頻譜數據
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      
      // 將 HTML5 audio 與 video 串接至 AudioContext
      const sourceAudio = audioCtx.createMediaElementSource(audioPlayer);
      const sourceVideo = audioCtx.createMediaElementSource(videoPlayer);
      
      sourceAudio.connect(analyser);
      sourceVideo.connect(analyser);
      
      analyser.connect(audioCtx.destination);
      
      drawVisualizer();
    } catch (err) {
      console.warn('此瀏覽器不支援 Web Audio API 或載入發生錯誤:', err);
    }
  }

  function drawVisualizer() {
    animationId = requestAnimationFrame(drawVisualizer);
    
    if (!analyser) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const baseRadius = 98; // 比專輯封面半徑 (90px) 稍微大一點點
    const bufferLength = analyser.frequencyBinCount;
    
    // 繪製圓形頻譜
    for (let i = 0; i < bufferLength; i++) {
      const value = dataArray[i];
      // 放大起伏效果
      const barLen = (value / 255) * 45; 
      
      // 角度分佈
      const angle = (i / bufferLength) * Math.PI * 2 - Math.PI / 2;
      
      const startX = cx + Math.cos(angle) * baseRadius;
      const startY = cy + Math.sin(angle) * baseRadius;
      const endX = cx + Math.cos(angle) * (baseRadius + barLen);
      const endY = cy + Math.sin(angle) * (baseRadius + barLen);
      
      // 動態顏色 (以紫色到淺藍色漸層)
      const r = 123 + Math.round((i / bufferLength) * 50);
      const g = 44 + Math.round((value / 255) * 150);
      const b = 191 + Math.round((i / bufferLength) * 60);
      
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + (value / 255) * 0.6})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
    
    // 繪製外圍動態波紋圈
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius - 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // === 歌詞與歌曲刪除功能 ===

  // 切換歌詞/頻譜顯示
  btnToggleLyrics.addEventListener('click', () => {
    lyricsMode = !lyricsMode;
    btnToggleLyrics.classList.toggle('active', lyricsMode);
    
    if (lyricsMode) {
      btnToggleLyrics.innerHTML = '<i data-lucide="music-2"></i>'; // 切換成頻譜圖示
      lyricsWrapper.classList.remove('hidden');
      coverWrapper.classList.add('hidden');
      canvas.classList.add('hidden');
      
      // 當切換到歌詞模式時，立即捲動到目前行
      const activePlayer = getActivePlayer();
      syncLyrics(activePlayer.currentTime);
    } else {
      btnToggleLyrics.innerHTML = '<i data-lucide="file-text"></i>'; // 切換成文字圖示
      lyricsWrapper.classList.add('hidden');
      coverWrapper.classList.remove('hidden');
      canvas.classList.remove('hidden');
    }
    refreshIcons();
  });

  // 解析 LRC 歌詞時間軸格式
  function parseLRC(lrcText) {
    if (!lrcText) return [];
    
    const lines = lrcText.split('\n');
    const timeReg = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
    const parsed = [];
    
    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine) return;
      
      const text = cleanLine.replace(timeReg, '').trim();
      timeReg.lastIndex = 0;
      
      let match;
      let hasTime = false;
      while ((match = timeReg.exec(cleanLine)) !== null) {
        hasTime = true;
        const minutes = parseInt(match[1], 10);
        const seconds = parseFloat(match[2]);
        const timeInSeconds = minutes * 60 + seconds;
        parsed.push({
          time: timeInSeconds,
          text: text || '🎵'
        });
      }
      
      if (!hasTime) {
        parsed.push({
          time: -999, // 純文字無時間軸
          text: cleanLine
        });
      }
    });
    
    // 過濾出有時間軸的，並依時間排序
    const timedLyrics = parsed.filter(item => item.time !== -999).sort((a, b) => a.time - b.time);
    const plainLyrics = parsed.filter(item => item.time === -999);
    
    if (timedLyrics.length > 0) {
      return timedLyrics;
    } else {
      // 若都是純文字，我們隨機依歌曲總長度等分，或用 5 秒一行作為展示
      return plainLyrics.map((item, idx) => ({
        time: idx * 5,
        text: item.text
      }));
    }
  }

  // 渲染歌詞
  function renderLyrics(song) {
    lyricsContainer.innerHTML = '';
    parsedLyrics = parseLRC(song.lyrics);
    
    if (parsedLyrics.length === 0) {
      lyricsContainer.innerHTML = `<p class="lyrics-line active">暫無歌詞，點擊下方編輯歌詞</p>`;
      return;
    }
    
    parsedLyrics.forEach((line, idx) => {
      const p = document.createElement('p');
      p.className = 'lyrics-line';
      p.setAttribute('data-index', idx);
      p.setAttribute('data-time', line.time);
      p.textContent = line.text;
      
      // 點擊該行歌詞可跳轉至該秒數
      p.addEventListener('click', () => {
        if (line.time >= 0) {
          const player = getActivePlayer();
          player.currentTime = line.time;
        }
      });
      
      lyricsContainer.appendChild(p);
    });
  }

  // 同步滾動高亮歌詞
  function syncLyrics(currentTime) {
    if (parsedLyrics.length === 0) return;
    
    let activeIdx = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (parsedLyrics[i].time <= currentTime) {
        activeIdx = i;
      } else {
        break;
      }
    }
    
    if (activeIdx !== -1) {
      const lines = lyricsContainer.querySelectorAll('.lyrics-line');
      lines.forEach(line => line.classList.remove('active'));
      
      const activeLine = lyricsContainer.querySelector(`.lyrics-line[data-index="${activeIdx}"]`);
      if (activeLine && !activeLine.classList.contains('active')) {
        activeLine.classList.add('active');
        
        // 置中滾動
        const containerHeight = lyricsContainer.clientHeight;
        const lineTop = activeLine.offsetTop;
        const lineHeight = activeLine.clientHeight;
        
        lyricsContainer.scrollTop = lineTop - (containerHeight / 2) + (lineHeight / 2);
      }
    }
  }

  // 彈出編輯歌詞視窗
  btnEditLyrics.addEventListener('click', () => {
    if (!currentSong) {
      showToast('請先播放一首歌曲再編輯歌詞', 'error');
      return;
    }
    textareaLyrics.value = currentSong.lyrics || '';
    lyricsModal.classList.remove('hidden');
  });

  // 關閉編輯歌詞彈窗
  btnCloseLyricsModal.addEventListener('click', () => {
    lyricsModal.classList.add('hidden');
  });
  
  btnCancelLyrics.addEventListener('click', () => {
    lyricsModal.classList.add('hidden');
  });

  // 儲存編輯後歌詞
  btnSaveLyrics.addEventListener('click', async () => {
    if (!currentSong) return;
    
    const newLyrics = textareaLyrics.value;
    
    try {
      const res = await fetch(`/api/songs/${currentSong.id}/lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: newLyrics })
      });
      const data = await res.json();
      
      if (data.success) {
        showToast('歌詞儲存成功！');
        lyricsModal.classList.add('hidden');
        
        // 同步更新本地資料快取中的歌曲歌詞
        currentSong.lyrics = newLyrics;
        const songInList = songs.find(s => s.id === currentSong.id);
        if (songInList) songInList.lyrics = newLyrics;
        
        // 重新渲染歌詞
        renderLyrics(currentSong);
      } else {
        showToast(data.error || '儲存歌詞失敗', 'error');
      }
    } catch (err) {
      showToast('與伺服器連線失敗', 'error');
    }
  });

  // 刪除歌曲功能
  async function handleDeleteSong(song) {
    if (!confirm(`確定要將歌曲「${song.title}」從伺服器永久刪除嗎？\n這會將它從所有歌單中移出，且無法復原。`)) {
      return;
    }
    
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      
      if (data.success) {
        showToast(`歌曲「${song.title}」已成功刪除`);
        
        // 如果刪除的是目前播放的歌曲，則暫停並重置
        if (currentSong && currentSong.id === song.id) {
          audioPlayer.pause();
          videoPlayer.pause();
          currentSong = null;
          isPlaying = false;
          updatePlayPauseUI();
          currentTitle.textContent = '未播放歌曲';
          currentArtist.textContent = '請從清單選擇歌曲或上傳新歌';
          coverImg.classList.add('hidden');
          coverIconDefault.classList.remove('hidden');
          videoContainer.classList.add('hidden');
          lyricsContainer.innerHTML = '';
        }
        
        await fetchSongs();
        await fetchPlaylists();
        await fetchStorageStatus();
        
        if (currentPlaylist) {
          await fetchPlaylistDetails(currentPlaylist.id);
        } else {
          renderSongsList(songs);
          playQueue = [...songs];
        }
      } else {
        showToast(data.error || '刪除歌曲失敗', 'error');
      }
    } catch (err) {
      showToast('刪除歌曲發生異常，請檢查網路連線', 'error');
    }
  }

  // === 輔助與公用函數 ===

  // 格式化時間 (秒 -> mm:ss)
  function formatTime(secs) {
    if (isNaN(secs) || secs === Infinity) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Toast 通知提示
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
    
    const icon = type === 'error' ? 'alert-circle' : 'info';
    toast.innerHTML = `
      <i data-lucide="${icon}"></i>
      <span>${escapeHtml(message)}</span>
    `;
    
    toastContainer.appendChild(toast);
    refreshIcons();

    // 3秒後淡出刪除
    setTimeout(() => {
      toast.style.animation = 'slide-out 0.3s forwards';
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    }, 3000);
  }

  // 防止 XSS HTML 轉義
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 更新手機鎖定畫面媒體資訊 (Media Session API)
  function updateMediaSession(song) {
    if ('mediaSession' in navigator) {
      const coverUrl = song.hasCover && song.coverUrl 
        ? window.location.origin + song.coverUrl 
        : window.location.origin + '/uploads/covers/default.png';
        
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album || 'Nebula Stream',
        artwork: [
          { src: coverUrl, sizes: '96x96',   type: 'image/png' },
          { src: coverUrl, sizes: '128x128', type: 'image/png' },
          { src: coverUrl, sizes: '192x192', type: 'image/png' },
          { src: coverUrl, sizes: '256x256', type: 'image/png' },
          { src: coverUrl, sizes: '384x384', type: 'image/png' },
          { src: coverUrl, sizes: '512x512', type: 'image/png' },
        ]
      });

      // 註冊鎖定畫面按鍵控制
      try {
        navigator.mediaSession.setActionHandler('play', () => { togglePlay(); });
        navigator.mediaSession.setActionHandler('pause', () => { togglePlay(); });
        navigator.mediaSession.setActionHandler('previoustrack', () => { prevSong(); });
        navigator.mediaSession.setActionHandler('nexttrack', () => { nextSong(false); });
      } catch (err) {
        console.warn('Media Session Action Handler 註冊失敗:', err.message);
      }
    }
  }

  // 更新手機版底部 Mini Player 內容
  function updateMiniPlayerUI() {
    if (!currentSong) {
      mobileMiniPlayer.classList.add('hidden');
      return;
    }
    
    // 更新文字
    miniTitle.textContent = currentSong.title;
    miniArtist.textContent = currentSong.artist;
    
    // 依據目前活動 Tab 決定是否顯示 mini-player (只有當不是在播放中 tab 時才顯示)
    const activeTab = mobileTabBar.querySelector('.tab-item.active')?.getAttribute('data-tab');
    if (activeTab === 'player') {
      mobileMiniPlayer.classList.add('hidden');
    } else {
      mobileMiniPlayer.classList.remove('hidden');
    }

    // 更新播放按鈕圖示
    if (isPlaying) {
      btnMiniPlayPause.innerHTML = '<i data-lucide="pause"></i>';
    } else {
      btnMiniPlayPause.innerHTML = '<i data-lucide="play"></i>';
    }
    refreshIcons();
  }

  // 手機版 Tab 切換與 Mini Player 點擊綁定
  function initMobileTabs() {
    // 預設加上 tab-library 樣式
    appContainer.classList.add('tab-library');
    
    mobileTabBar.querySelectorAll('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        // 切換 active 樣式
        mobileTabBar.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        
        const targetTab = tab.getAttribute('data-tab');
        
        // 切換容器樣式
        appContainer.classList.remove('tab-library', 'tab-player', 'tab-playlists');
        appContainer.classList.add(`tab-${targetTab}`);
        
        // 更新 mini-player 隱藏/顯示
        updateMiniPlayerUI();
      });
    });

    // 點擊 mini-player 資訊處直接跳轉到播放中 tab
    mobileMiniPlayer.querySelector('.mini-info').addEventListener('click', () => {
      const playerTab = mobileTabBar.querySelector('[data-tab="player"]');
      if (playerTab) playerTab.click();
    });

    // 迷你播放按鈕事件
    btnMiniPlayPause.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlay();
    });

    btnMiniNext.addEventListener('click', (e) => {
      e.stopPropagation();
      nextSong(false);
    });
  }

  // 手機背景播放切換機制 (當切到背景/關屏，將 video 換成 audio 播放)
  document.addEventListener('visibilitychange', () => {
    if (!currentSong || !currentSong.isVideo) return;
    
    if (document.hidden) {
      if (isPlaying) {
        const time = videoPlayer.currentTime;
        videoPlayer.pause();
        
        audioPlayer.src = currentSong.fileUrl;
        audioPlayer.currentTime = time;
        audioPlayer.volume = isMuted ? 0 : currentVolume;
        audioPlayer.playbackRate = parseFloat(selectSpeed.value);
        
        audioPlayer.play()
          .then(() => {
            isPlaying = true;
            updatePlayPauseUI();
            updateMiniPlayerUI();
          })
          .catch(err => console.log('音軌背景過渡失敗:', err.message));
      }
    } else {
      // 回到前台，如果 audio 正在播影片的音軌，無縫還原回 video
      if (isPlaying && audioPlayer.src !== '') {
        const time = audioPlayer.currentTime;
        audioPlayer.pause();
        audioPlayer.src = '';
        
        videoContainer.classList.remove('hidden');
        videoPlayer.src = currentSong.fileUrl;
        videoPlayer.currentTime = time;
        videoPlayer.volume = isMuted ? 0 : currentVolume;
        videoPlayer.playbackRate = parseFloat(selectSpeed.value);
        
        videoPlayer.play()
          .then(() => {
            isPlaying = true;
            updatePlayPauseUI();
            updateMiniPlayerUI();
          })
          .catch(err => console.log('畫面還原失敗:', err.message));
      }
    }
  });

  // === 初始化執行入口 ===
  (async function init() {
    await fetchSongs();
    await fetchPlaylists();
    await fetchStorageStatus();
    initMobileTabs(); // 初始化手機版導覽列與事件
    await checkSharedPlaylist();
  })();
});
