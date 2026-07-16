import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import * as musicMetadata from 'music-metadata';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化目錄與資料庫
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const COVERS_DIR = path.join(UPLOADS_DIR, 'covers');

function generateDefaultLyrics(title, artist) {
  return `[00:00.00]🎵 Nebula Stream - 自動分析與加載歌詞中...
[00:03.00]標題：${title}
[00:06.00]歌手：${artist}
[00:10.00]🌌 (偵測到上傳音檔，正在為您同步音樂頻譜與節奏)
[00:18.00]✨ 歡迎使用 Nebula Stream 雲端播放器！
[00:25.00]💫 在這浪漫的星空中，歌聲隨著微風輕輕吹送
[00:34.00]🌌 點擊上方右上角「歌詞」圖示可以切換回頻譜圖
[00:45.00]🎵 點擊歌詞區域的「編輯歌詞」按鈕可以匯入您自訂的歌詞喔！
[00:55.00]⚡ 副歌旋律升起，動態 Canvas 發出璀璨光芒
[01:05.00]🌟 音符跳動在玻璃面板上，將旋律化作最美畫卷
[01:18.00]🌌 (正在播放主歌二 - 請享受高解析音樂品質)
[01:28.00]💫 分享歌單給你的好友，讓他們在雲端同步收聽
[01:40.00]🌟 無論是 MP3 音樂還是 MP4 影片，都能完美播放
[01:52.00]🎵 音樂正緩緩降落，帶領我們走入平靜的夜...
[02:05.00]✨ 感謝您的使用，祝您有美好的一天！
[02:15.00]🎵 (歌曲播放結束)`;
}

function decodeGarbledString(str) {
  if (!str) return str;
  const cp1252Map = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
    0x9e: 0x017e, 0x9f: 0x0178
  };
  const revMap = {};
  for (let b = 0; b < 256; b++) {
    if (b >= 0x80 && b <= 0x9f) {
      const uni = cp1252Map[b];
      if (uni) revMap[uni] = b;
    }
  }

  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else if (revMap[code] !== undefined) {
      bytes.push(revMap[code]);
    } else if (code >= 128 && code <= 255) {
      bytes.push(code);
    } else {
      const buf = Buffer.from(str[i], 'utf8');
      for (let j = 0; j < buf.length; j++) {
        bytes.push(buf[j]);
      }
    }
  }

  try {
    const decoded = Buffer.from(bytes).toString('utf8');
    if (decoded !== str && !decoded.includes('\ufffd')) {
      return decoded;
    }
  } catch (err) {
    // 忽略錯誤
  }
  return str;
}

function initDb() {
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ songs: [], playlists: [] }, null, 2));
  } else {
    // 檢查舊資料並進行轉移更新 (自動補齊 lyrics 欄位與修正亂碼)
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      let updated = false;
      if (data.songs) {
        data.songs.forEach(song => {
          if (song.lyrics === undefined) {
            song.lyrics = generateDefaultLyrics(song.title, song.artist);
            updated = true;
          }

          // 自動修復已上傳的亂碼資料
          let songUpdated = false;
          const fixedTitle = decodeGarbledString(song.title);
          if (fixedTitle !== song.title) {
            song.title = fixedTitle;
            songUpdated = true;
            updated = true;
          }
          
          const fixedArtist = decodeGarbledString(song.artist);
          if (fixedArtist !== song.artist) {
            song.artist = fixedArtist;
            songUpdated = true;
            updated = true;
          }

          const fixedOriginalName = decodeGarbledString(song.originalName);
          if (fixedOriginalName !== song.originalName) {
            song.originalName = fixedOriginalName;
            updated = true;
          }

          // 自動修復歌詞內可能存在的亂碼
          if (song.lyrics) {
            const fixedLyrics = decodeGarbledString(song.lyrics);
            if (fixedLyrics !== song.lyrics) {
              song.lyrics = fixedLyrics;
              updated = true;
            }
            if (song.lyrics.includes('\u00e8\u008c\u0089\u00e3\u0081\u00b2\u00e3\u0082\u008b')) {
              song.lyrics = song.lyrics.replace(/\u00e8\u008c\u0089\u00e3\u0081\u00b2\u00e3\u0082\u008b/g, '茉ひる');
              updated = true;
            }
          }

          // 如果這首歌的標題或歌手被修復了，且目前歌詞是預設歌詞，則重新產生以呈現正確資訊
          if (songUpdated && song.lyrics && song.lyrics.includes('自動分析與加載歌詞中...')) {
            song.lyrics = generateDefaultLyrics(song.title, song.artist);
            updated = true;
          }
        });
      }
      if (updated) {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error('資料庫轉移更新失敗:', err.message);
    }
  }
}
initDb();
function getDirSize(dirPath) {
  let size = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return stat.size;

    const files = fs.readdirSync(dirPath);
    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(dirPath, files[i]);
      size += getDirSize(filePath);
    }
  } catch (err) {
    console.error(`無法讀取目錄/檔案大小 ${dirPath}:`, err.message);
  }
  return size;
}

async function getDiskSpace() {
  const isWindows = process.platform === 'win32';
  try {
    if (isWindows) {
      const drive = path.parse(__dirname).root.substring(0, 2); // 例如 "C:"
      const { stdout } = await execPromise(`powershell -Command "Get-Volume -DriveLetter ${drive[0]} | Select-Object Size, SizeRemaining | ConvertTo-Json"`);
      const disk = JSON.parse(stdout);
      return {
        total: disk.Size, // bytes
        free: disk.SizeRemaining // bytes
      };
    } else {
      // 支援 Linux / macOS 系統 (如 Render, Heroku 等雲端環境)
      const { stdout } = await execPromise(`df -B1 "${__dirname}"`);
      const lines = stdout.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10);
          const free = parseInt(parts[3], 10);
          return { total, free };
        }
      }
      throw new Error('無法解析 df 輸出格式');
    }
  } catch (err) {
    console.error('取得實體硬碟空間失敗，改為 1GB 模擬容量為備用方案:', err.message);
    const usedSpace = getDirSize(UPLOADS_DIR);
    return {
      total: 1024 * 1024 * 1024,
      free: Math.max(0, 1024 * 1024 * 1024 - usedSpace)
    };
  }
}


function readDb() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return { songs: [], playlists: [] };
  }
}

function writeDb(data) {
  const tmpPath = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, DB_FILE);
}

// Multer 上傳設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const id = uuidv4();
    cb(null, `${id}${ext}`);
  }
});

// 限制檔案類型為音訊與影片
const fileFilter = (req, file, cb) => {
  const mime = file.mimetype;
  if (mime.startsWith('audio/') || mime.startsWith('video/') || mime === 'application/octet-stream') {
    cb(null, true);
  } else {
    cb(new Error('只支援音訊與影片檔案！'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 限制 100MB
});

// 中間件設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 靜態目錄託管
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// === API 路由 ===

// 1. 取得所有歌曲
app.get('/api/songs', (req, res) => {
  const db = readDb();
  res.json(db.songs);
});

// 1.5. 取得儲存空間狀態
app.get('/api/storage-status', async (req, res) => {
  try {
    const usedSpace = getDirSize(UPLOADS_DIR);
    const disk = await getDiskSpace();
    
    // 總容量 = 已使用上傳容量 + 硬碟剩餘空間
    const totalSpace = usedSpace + disk.free;
    
    res.json({
      success: true,
      usedSpace,
      totalSpace,
      remainingSpace: disk.free
    });
  } catch (err) {
    console.error('取得儲存空間狀態失敗:', err);
    res.status(500).json({ error: '無法取得儲存空間狀態' });
  }
});

// 2. 上傳歌曲與解析標籤
app.post('/api/upload', upload.single('music'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請選擇要上傳的檔案' });
  }

  const filePath = req.file.path;
  const fileName = req.file.filename;

  // 檢查硬碟剩餘空間是否足夠
  const disk = await getDiskSpace();
  if (disk.free < req.file.size) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error('刪除超額檔案失敗:', err.message);
    }
    return res.status(400).json({ error: '硬碟剩餘空間不足，上傳失敗！' });
  }

  // 修正 Multer 檔名亂碼 (CP1252/ISO-8859-1 轉 UTF-8)
  const originalName = decodeGarbledString(req.file.originalname);
  const fileExt = path.extname(originalName).toLowerCase();
  
  let title = path.basename(originalName, fileExt);
  let artist = '未知歌手';
  let album = '未知專輯';
  let duration = 0;
  let hasCover = false;
  let coverUrl = '';
  let lyrics = '';

  // 解析音訊 metadata
  try {
    const metadata = await musicMetadata.parseFile(filePath);
    
    if (metadata.common) {
      if (metadata.common.title) title = metadata.common.title;
      if (metadata.common.artist) artist = metadata.common.artist;
      if (metadata.common.album) album = metadata.common.album;
      
      // 擷取歌詞 (如果有的話)
      if (metadata.common.lyrics) {
        lyrics = Array.isArray(metadata.common.lyrics)
          ? metadata.common.lyrics.join('\n')
          : metadata.common.lyrics;
      }
      
      // 處理內嵌封面
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const pic = metadata.common.picture[0];
        const coverId = uuidv4();
        const picExt = pic.format.split('/')[1] || 'jpg';
        const coverFileName = `${coverId}.${picExt}`;
        const coverFilePath = path.join(COVERS_DIR, coverFileName);
        
        fs.writeFileSync(coverFilePath, pic.data);
        hasCover = true;
        coverUrl = `/uploads/covers/${coverFileName}`;
      }
    }
    
    if (metadata.format && metadata.format.duration) {
      duration = Math.round(metadata.format.duration);
    }
  } catch (err) {
    console.error('Metadata 解析失敗或無 metadata，使用預設檔名資訊:', err.message);
  }

  if (!lyrics) {
    lyrics = generateDefaultLyrics(title, artist);
  }

  const isVideo = fileExt === '.mp4' || req.file.mimetype.startsWith('video/');

  const newSong = {
    id: uuidv4(),
    filename: fileName,
    originalName,
    title,
    artist,
    album,
    duration, // 秒數
    isVideo,
    hasCover,
    coverUrl: hasCover ? coverUrl : '',
    fileUrl: `/uploads/${fileName}`,
    lyrics, // 儲存歌詞
    uploadTime: new Date().toISOString()
  };

  const db = readDb();
  db.songs.push(newSong);
  writeDb(db);

  res.json({ success: true, song: newSong });
});

// 3. 取得所有歌單
app.get('/api/playlists', (req, res) => {
  const db = readDb();
  res.json(db.playlists);
});

// 4. 建立歌單
app.post('/api/playlists', (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: '歌單名稱不得為空' });
  }

  const db = readDb();
  const newPlaylist = {
    id: uuidv4(),
    name: name.trim(),
    songIds: [],
    createTime: new Date().toISOString()
  };

  db.playlists.push(newPlaylist);
  writeDb(db);

  res.json({ success: true, playlist: newPlaylist });
});

// 5. 取得特定歌單內容 (含歌曲完整物件)
app.get('/api/playlists/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const playlist = db.playlists.find(p => p.id === id);
  
  if (!playlist) {
    return res.status(404).json({ error: '找不到該歌單' });
  }

  // 取得該歌單所有歌曲的完整資料
  const playlistSongs = playlist.songIds
    .map(songId => db.songs.find(s => s.id === songId))
    .filter(Boolean); // 過濾掉可能已不存在的歌曲

  res.json({
    ...playlist,
    songs: playlistSongs
  });
});

// 6. 將歌曲加入歌單
app.post('/api/playlists/:id/songs', (req, res) => {
  const { id } = req.params;
  const { songId } = req.body;

  if (!songId) {
    return res.status(400).json({ error: '請提供歌曲 ID' });
  }

  const db = readDb();
  const playlistIndex = db.playlists.findIndex(p => p.id === id);
  
  if (playlistIndex === -1) {
    return res.status(404).json({ error: '找不到該歌單' });
  }

  const songExists = db.songs.some(s => s.id === songId);
  if (!songExists) {
    return res.status(404).json({ error: '找不到該歌曲' });
  }

  // 避免重複加入
  if (!db.playlists[playlistIndex].songIds.includes(songId)) {
    db.playlists[playlistIndex].songIds.push(songId);
    writeDb(db);
  }

  res.json({ success: true, playlist: db.playlists[playlistIndex] });
});

// 7. 將歌曲移出歌單
app.post('/api/playlists/:id/songs/remove', (req, res) => {
  const { id } = req.params;
  const { songId } = req.body;

  if (!songId) {
    return res.status(400).json({ error: '請提供歌曲 ID' });
  }

  const db = readDb();
  const playlistIndex = db.playlists.findIndex(p => p.id === id);
  
  if (playlistIndex === -1) {
    return res.status(404).json({ error: '找不到該歌單' });
  }

  db.playlists[playlistIndex].songIds = db.playlists[playlistIndex].songIds.filter(sid => sid !== songId);
  writeDb(db);

  res.json({ success: true, playlist: db.playlists[playlistIndex] });
});

// 8. 刪除歌單
app.delete('/api/playlists/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  
  const playlistIndex = db.playlists.findIndex(p => p.id === id);
  if (playlistIndex === -1) {
    return res.status(404).json({ error: '找不到該歌單' });
  }

  db.playlists.splice(playlistIndex, 1);
  writeDb(db);

  res.json({ success: true, message: '歌單已成功刪除' });
});

// 9. 刪除歌曲
app.delete('/api/songs/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  
  const songIndex = db.songs.findIndex(s => s.id === id);
  if (songIndex === -1) {
    return res.status(404).json({ error: '找不到該歌曲' });
  }
  
  const song = db.songs[songIndex];
  
  // 1. 刪除媒體檔案
  const filePath = path.join(UPLOADS_DIR, song.filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('刪除媒體檔案失敗:', err.message);
  }
  
  // 2. 刪除封面檔案 (若有)
  if (song.hasCover && song.coverUrl) {
    const coverFileName = path.basename(song.coverUrl);
    const coverPath = path.join(COVERS_DIR, coverFileName);
    try {
      if (fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath);
      }
    } catch (err) {
      console.error('刪除封面檔案失敗:', err.message);
    }
  }
  
  // 3. 從所有歌單中移除該歌曲 ID
  db.playlists.forEach(pl => {
    pl.songIds = pl.songIds.filter(sid => sid !== id);
  });
  
  // 4. 從 songs 中移除該歌曲
  db.songs.splice(songIndex, 1);
  writeDb(db);
  
  res.json({ success: true, message: '歌曲已成功刪除' });
});

// 10. 更新歌曲歌詞
app.post('/api/songs/:id/lyrics', (req, res) => {
  const { id } = req.params;
  const { lyrics } = req.body;
  
  if (lyrics === undefined) {
    return res.status(400).json({ error: '請提供歌詞內容' });
  }
  
  const db = readDb();
  const songIndex = db.songs.findIndex(s => s.id === id);
  if (songIndex === -1) {
    return res.status(404).json({ error: '找不到該歌曲' });
  }
  
  db.songs[songIndex].lyrics = lyrics;
  writeDb(db);
  
  res.json({ success: true, song: db.songs[songIndex] });
});

// 所有其他請求回傳前端首頁 (SPA 路由)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 錯誤處理中間件
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '伺服器內部錯誤' });
});

app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  音樂播放器伺服器已啟動！`);
  console.log(`  網址：http://localhost:${PORT}`);
  console.log(`========================================`);
});
