import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import * as musicMetadata from 'music-metadata';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

// 載入環境變數
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化目錄
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const COVERS_DIR = path.join(UPLOADS_DIR, 'covers');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// === MongoDB 設定 ===
const songSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  filename: String,
  originalName: String,
  title: String,
  artist: String,
  album: String,
  duration: Number,
  isVideo: Boolean,
  hasCover: Boolean,
  coverUrl: String,
  fileUrl: String,
  cloudinaryPublicId: String,
  cloudinaryCoverPublicId: String,
  lyrics: String,
  fileSize: Number,
  uploadTime: { type: Date, default: Date.now }
});

const playlistSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  songIds: [String],
  createTime: { type: Date, default: Date.now }
});

const Song = mongoose.model('Song', songSchema);
const Playlist = mongoose.model('Playlist', playlistSchema);

// 連線至 MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(async () => {
      console.log('MongoDB 連線成功！');
      // 執行本地資料遷移
      await migrateLocalDbToCloud();
    })
    .catch(err => {
      console.error('MongoDB 連線失敗:', err.message);
    });
} else {
  console.warn('⚠️ 未偵測到 MONGODB_URI 環境變數，請確認是否已在 .env 檔案中設定。伺服器將無法正常運作。');
}

// === Cloudinary 設定 ===
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// === 本地資料庫遷移至雲端 ===
async function migrateLocalDbToCloud() {
  let localDbPath = path.join(UPLOADS_DIR, 'db.json');
  if (!fs.existsSync(localDbPath)) {
    const altPath = path.join(__dirname, 'data', 'db.json');
    if (fs.existsSync(altPath)) {
      localDbPath = altPath;
    } else {
      return;
    }
  }

  try {
    const songCount = await Song.countDocuments();
    if (songCount > 0) return; // 雲端已有資料，不進行重複遷移

    console.log('--------------------------------------------------');
    console.log('偵測到本地 db.json 且雲端資料庫為空，嘗試進行自動遷移...');
    console.log('這會將您本地的歌曲與封面圖片上傳至 Cloudinary。請耐心等候...');
    console.log('--------------------------------------------------');

    const localData = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
    if (!localData.songs || localData.songs.length === 0) return;

    for (const song of localData.songs) {
      const localFilePath = path.join(UPLOADS_DIR, song.filename);
      if (!fs.existsSync(localFilePath)) {
        console.warn(`⚠️ 找不到本地歌曲檔案: ${song.filename}，跳過遷移此歌曲。`);
        continue;
      }

      console.log(`[遷移中] 歌曲: ${song.title} (${song.filename}) 至 Cloudinary...`);
      const uploadResult = await cloudinary.uploader.upload(localFilePath, {
        resource_type: 'auto',
        folder: 'music_player/media'
      });

      let coverUrl = '';
      let cloudinaryCoverPublicId = '';
      if (song.hasCover && song.coverUrl) {
        const coverFileName = path.basename(song.coverUrl);
        const localCoverPath = path.join(COVERS_DIR, coverFileName);
        if (fs.existsSync(localCoverPath)) {
          console.log(`[遷移中] 封面: ${song.title} 至 Cloudinary...`);
          const coverUploadResult = await cloudinary.uploader.upload(localCoverPath, {
            resource_type: 'image',
            folder: 'music_player/covers'
          });
          coverUrl = coverUploadResult.secure_url;
          cloudinaryCoverPublicId = coverUploadResult.public_id;
        }
      }

      const fileSize = fs.statSync(localFilePath).size;

      const newSong = new Song({
        id: song.id,
        filename: song.filename,
        originalName: song.originalName,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        isVideo: song.isVideo,
        hasCover: song.hasCover,
        coverUrl: song.hasCover ? coverUrl : '',
        fileUrl: uploadResult.secure_url,
        cloudinaryPublicId: uploadResult.public_id,
        cloudinaryCoverPublicId,
        lyrics: song.lyrics,
        fileSize,
        uploadTime: song.uploadTime
      });

      await newSong.save();
      console.log(`✅ 成功遷移歌曲: ${song.title}`);
    }

    // 遷移歌單
    if (localData.playlists && localData.playlists.length > 0) {
      console.log('[遷移中] 歌單資訊至 MongoDB...');
      for (const pl of localData.playlists) {
        const newPlaylist = new Playlist({
          id: pl.id,
          name: pl.name,
          songIds: pl.songIds,
          createTime: pl.createTime
        });
        await newPlaylist.save();
      }
      console.log('✅ 歌單遷移完成！');
    }

    console.log('--------------------------------------------------');
    console.log('🎉 所有本地資料已成功遷移至雲端！');
    console.log('您可以安全地刪除本地 uploads 資料夾中的舊媒體檔案與 db.json。');
    console.log('--------------------------------------------------');
  } catch (err) {
    console.error('❌ 自動遷移失敗:', err.message);
  }
}

// === 歌詞產生與字元解碼 Helpers ===
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

const TOTAL_QUOTA = 5 * 1024 * 1024 * 1024; // 5 GB 雲端空間限制

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

// 停用 API 快取，確保容量與清單即時更新
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// 靜態目錄託管
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// === API 路由 ===

// 1. 取得所有歌曲
app.get('/api/songs', async (req, res) => {
  try {
    const songs = await Song.find().sort({ uploadTime: -1 });
    res.json(songs);
  } catch (err) {
    console.error('無法取得歌曲列表:', err);
    res.status(500).json({ error: '無法取得歌曲列表' });
  }
});

// 1.5. 取得儲存空間狀態
app.get('/api/storage-status', async (req, res) => {
  try {
    const result = await Song.aggregate([
      { $group: { _id: null, totalSize: { $sum: '$fileSize' } } }
    ]);
    const usedSpace = result[0]?.totalSize || 0;
    res.json({
      success: true,
      usedSpace,
      totalSpace: TOTAL_QUOTA,
      remainingSpace: Math.max(0, TOTAL_QUOTA - usedSpace)
    });
  } catch (err) {
    console.error('取得儲存空間狀態失敗:', err);
    res.status(500).json({ error: '無法取得儲存空間狀態' });
  }
});

// 2. 上傳歌曲與解析標籤，並上傳至 Cloudinary 與 MongoDB
app.post('/api/upload', upload.single('music'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '請選擇要上傳的檔案' });
  }

  const filePath = req.file.path;
  const fileName = req.file.filename;

  // 取得檔案大小
  let fileSize = 0;
  try {
    fileSize = fs.statSync(filePath).size;
  } catch (err) {
    fileSize = req.file.size || 0;
  }

  // 檢查雲端儲存空間是否超額
  try {
    const result = await Song.aggregate([
      { $group: { _id: null, totalSize: { $sum: '$fileSize' } } }
    ]);
    const usedSpace = result[0]?.totalSize || 0;

    if (usedSpace + fileSize > TOTAL_QUOTA) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('刪除超額檔案失敗:', err.message);
      }
      return res.status(400).json({ error: '雲端儲存空間已滿，上傳失敗！空間上限為 5 GB。' });
    }
  } catch (err) {
    console.error('檢查配額失敗:', err);
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
  let cloudinaryCoverPublicId = '';
  let lyrics = '';

  let coverTempPath = null;

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
        coverTempPath = path.join(UPLOADS_DIR, coverFileName);
        
        fs.writeFileSync(coverTempPath, pic.data);
        hasCover = true;
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

  // 上傳檔案至 Cloudinary
  let cloudinarySongUrl = '';
  let cloudinarySongPublicId = '';

  try {
    console.log(`[Cloudinary] 正在上傳媒體檔案: ${title}`);
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: 'auto',
      folder: 'music_player/media'
    });
    cloudinarySongUrl = uploadResult.secure_url;
    cloudinarySongPublicId = uploadResult.public_id;

    // 如果有內嵌封面，也上傳至 Cloudinary
    if (hasCover && coverTempPath) {
      console.log(`[Cloudinary] 正在上傳封面圖片: ${title}`);
      const coverUploadResult = await cloudinary.uploader.upload(coverTempPath, {
        resource_type: 'image',
        folder: 'music_player/covers'
      });
      coverUrl = coverUploadResult.secure_url;
      cloudinaryCoverPublicId = coverUploadResult.public_id;
    }
  } catch (uploadErr) {
    console.error('Cloudinary 上傳失敗:', uploadErr);
    // 清除本地暫存檔案
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (coverTempPath && fs.existsSync(coverTempPath)) fs.unlinkSync(coverTempPath);
    } catch (e) {}
    return res.status(500).json({ error: '檔案上傳至雲端儲存空間失敗！' });
  }

  // 立即刪除伺服器上的本地暫存檔案
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (coverTempPath && fs.existsSync(coverTempPath)) fs.unlinkSync(coverTempPath);
  } catch (e) {
    console.error('刪除暫存檔案失敗:', e.message);
  }

  // 將資料寫入 MongoDB
  const songId = uuidv4();
  const newSong = new Song({
    id: songId,
    filename: fileName,
    originalName,
    title,
    artist,
    album,
    duration,
    isVideo,
    hasCover,
    coverUrl: hasCover ? coverUrl : '',
    fileUrl: cloudinarySongUrl,
    cloudinaryPublicId: cloudinarySongPublicId,
    cloudinaryCoverPublicId,
    lyrics,
    fileSize,
    uploadTime: new Date()
  });

  try {
    await newSong.save();

    // 如果有帶資料夾名稱（playlistName），自動建立該歌單並關聯這首歌
    const playlistName = req.body.playlistName;
    if (playlistName && playlistName.trim() !== '') {
      const plName = playlistName.trim();
      let playlist = await Playlist.findOne({ name: { $regex: new RegExp(`^${plName}$`, 'i') } });
      
      if (!playlist) {
        playlist = new Playlist({
          id: uuidv4(),
          name: plName,
          songIds: [songId]
        });
        await playlist.save();
      } else {
        if (!playlist.songIds.includes(songId)) {
          playlist.songIds.push(songId);
          await playlist.save();
        }
      }
    }

    res.json({ success: true, song: newSong });
  } catch (dbErr) {
    console.error('寫入資料庫失敗:', dbErr);
    res.status(500).json({ error: '寫入資料庫失敗' });
  }
});

// 3. 取得所有歌單
app.get('/api/playlists', async (req, res) => {
  try {
    const playlists = await Playlist.find().sort({ createTime: -1 });
    res.json(playlists);
  } catch (err) {
    console.error('無法取得歌單列表:', err);
    res.status(500).json({ error: '無法取得歌單列表' });
  }
});

// 4. 建立歌單
app.post('/api/playlists', async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: '歌單名稱不得為空' });
  }

  try {
    const newPlaylist = new Playlist({
      id: uuidv4(),
      name: name.trim(),
      songIds: []
    });

    await newPlaylist.save();
    res.json({ success: true, playlist: newPlaylist });
  } catch (err) {
    console.error('建立歌單失敗:', err);
    res.status(500).json({ error: '建立歌單失敗' });
  }
});

// 5. 取得特定歌單內容 (含歌曲完整物件)
app.get('/api/playlists/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const playlist = await Playlist.findOne({ id });
    
    if (!playlist) {
      return res.status(404).json({ error: '找不到該歌單' });
    }

    // 取得該歌單所有歌曲的完整資料
    const songs = await Song.find({ id: { $in: playlist.songIds } });
    
    // 依歌單內 ID 順序排序
    const playlistSongs = playlist.songIds
      .map(songId => songs.find(s => s.id === songId))
      .filter(Boolean);

    res.json({
      id: playlist.id,
      name: playlist.name,
      songIds: playlist.songIds,
      createTime: playlist.createTime,
      songs: playlistSongs
    });
  } catch (err) {
    console.error('取得歌單詳情失敗:', err);
    res.status(500).json({ error: '取得歌單詳情失敗' });
  }
});

// 6. 將歌曲加入歌單
app.post('/api/playlists/:id/songs', async (req, res) => {
  const { id } = req.params;
  const { songId } = req.body;

  if (!songId) {
    return res.status(400).json({ error: '請提供歌曲 ID' });
  }

  try {
    const playlist = await Playlist.findOne({ id });
    if (!playlist) {
      return res.status(404).json({ error: '找不到該歌單' });
    }

    const songExists = await Song.exists({ id: songId });
    if (!songExists) {
      return res.status(404).json({ error: '找不到該歌曲' });
    }

    // 避免重複加入
    if (!playlist.songIds.includes(songId)) {
      playlist.songIds.push(songId);
      await playlist.save();
    }

    res.json({ success: true, playlist });
  } catch (err) {
    console.error('歌曲加入歌單失敗:', err);
    res.status(500).json({ error: '歌曲加入歌單失敗' });
  }
});

// 7. 將歌曲移出歌單
app.post('/api/playlists/:id/songs/remove', async (req, res) => {
  const { id } = req.params;
  const { songId } = req.body;

  if (!songId) {
    return res.status(400).json({ error: '請提供歌曲 ID' });
  }

  try {
    const playlist = await Playlist.findOne({ id });
    if (!playlist) {
      return res.status(404).json({ error: '找不到該歌單' });
    }

    playlist.songIds = playlist.songIds.filter(sid => sid !== songId);
    await playlist.save();

    res.json({ success: true, playlist });
  } catch (err) {
    console.error('歌曲移出歌單失敗:', err);
    res.status(500).json({ error: '歌曲移出歌單失敗' });
  }
});

// 8. 刪除歌單
app.delete('/api/playlists/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await Playlist.deleteOne({ id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: '找不到該歌單' });
    }
    res.json({ success: true, message: '歌單已成功刪除' });
  } catch (err) {
    console.error('刪除歌單失敗:', err);
    res.status(500).json({ error: '刪除歌單失敗' });
  }
});

// 8.5. 修改歌單名稱
app.post('/api/playlists/:id/rename', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: '請提供有效的歌單名稱' });
  }

  try {
    const playlist = await Playlist.findOne({ id });
    if (!playlist) {
      return res.status(404).json({ error: '找不到該歌單' });
    }

    playlist.name = name.trim();
    await playlist.save();

    res.json({ success: true, playlist });
  } catch (err) {
    console.error('修改歌單名稱失敗:', err);
    res.status(500).json({ error: '修改歌單名稱失敗' });
  }
});

// 9. 刪除歌曲 (自 MongoDB 及 Cloudinary 刪除)
app.delete('/api/songs/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const song = await Song.findOne({ id });
    if (!song) {
      return res.status(404).json({ error: '找不到該歌曲' });
    }

    // 1. 刪除 Cloudinary 媒體檔案
    if (song.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(song.cloudinaryPublicId, { resource_type: 'video' });
      } catch (err) {
        console.error('刪除 Cloudinary 媒體檔案失敗:', err.message);
      }
    }

    // 2. 刪除 Cloudinary 封面檔案 (若有)
    if (song.hasCover && song.cloudinaryCoverPublicId) {
      try {
        await cloudinary.uploader.destroy(song.cloudinaryCoverPublicId, { resource_type: 'image' });
      } catch (err) {
        console.error('刪除 Cloudinary 封面檔案失敗:', err.message);
      }
    }

    // 3. 從所有歌單中移除該歌曲 ID
    await Playlist.updateMany(
      { songIds: id },
      { $pull: { songIds: id } }
    );

    // 4. 從 Song 資料表移除
    await Song.deleteOne({ id });

    res.json({ success: true, message: '歌曲已成功刪除' });
  } catch (err) {
    console.error('刪除歌曲失敗:', err);
    res.status(500).json({ error: '無法刪除歌曲' });
  }
});

// 9.5. 批量刪除歌曲
app.post('/api/songs/batch-delete', async (req, res) => {
  const { songIds } = req.body;
  if (!songIds || !Array.isArray(songIds) || songIds.length === 0) {
    return res.status(400).json({ error: '請提供要刪除的歌曲 ID 清單' });
  }

  try {
    const songs = await Song.find({ id: { $in: songIds } });
    let deletedCount = 0;

    for (const song of songs) {
      // 1. 刪除 Cloudinary 媒體檔案
      if (song.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(song.cloudinaryPublicId, { resource_type: 'video' });
        } catch (err) {
          console.error(`刪除 Cloudinary 媒體檔案失敗 ${song.title}:`, err.message);
        }
      }

      // 2. 刪除 Cloudinary 封面檔案 (若有)
      if (song.hasCover && song.cloudinaryCoverPublicId) {
        try {
          await cloudinary.uploader.destroy(song.cloudinaryCoverPublicId, { resource_type: 'image' });
        } catch (err) {
          console.error(`刪除 Cloudinary 封面檔案失敗 ${song.title}:`, err.message);
        }
      }

      // 3. 從所有歌單中移除該歌曲 ID
      await Playlist.updateMany(
        { songIds: song.id },
        { $pull: { songIds: song.id } }
      );

      // 4. 從 Song 資料表移除
      await Song.deleteOne({ id: song.id });
      deletedCount++;
    }

    res.json({ success: true, message: `成功刪除 ${deletedCount} 首歌曲！` });
  } catch (err) {
    console.error('批量刪除歌曲失敗:', err);
    res.status(500).json({ error: '無法批量刪除歌曲' });
  }
});

// 10. 更新歌曲歌詞
app.post('/api/songs/:id/lyrics', async (req, res) => {
  const { id } = req.params;
  const { lyrics } = req.body;
  
  if (lyrics === undefined) {
    return res.status(400).json({ error: '請提供歌詞內容' });
  }
  
  try {
    const song = await Song.findOne({ id });
    if (!song) {
      return res.status(404).json({ error: '找不到該歌曲' });
    }

    song.lyrics = lyrics;
    await song.save();

    res.json({ success: true, song });
  } catch (err) {
    console.error('更新歌詞失敗:', err);
    res.status(500).json({ error: '無法更新歌詞' });
  }
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
