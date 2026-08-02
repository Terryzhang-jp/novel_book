const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 并行数量
const CONCURRENCY = 20;

// 根据文件头判断实际图片类型
function detectImageType(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(12);
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'jpg';
    }
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return 'png';
    }
    // GIF: 47 49 46
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'gif';
    }
    // WebP: RIFF....WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return 'webp';
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Read .env.local file
const envPath = path.join(__dirname, '../../../.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const outputDir = '/Users/yichuanzhang/Desktop/travel_creation/photos';

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error('Status: ' + response.statusCode));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function downloadPhoto(photo) {
  // 先下载到临时文件
  const tempPath = path.join(outputDir, 'temp_' + photo.id);

  await downloadFile(photo.file_url, tempPath);

  // 检测实际文件类型
  let ext = detectImageType(tempPath);
  if (!ext) {
    ext = photo.file_url.split('.').pop().split('?')[0] || 'jpg';
    if (ext === 'blob') ext = 'jpg';
  }

  // 格式: userPrefix_photoId.ext (简化文件名)
  const safeFileName = photo.user_id.substring(0, 8) + '_' + photo.id + '.' + ext;
  const destPath = path.join(outputDir, safeFileName);

  // 重命名临时文件
  fs.renameSync(tempPath, destPath);
  return safeFileName;
}

async function downloadAllPhotos() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // 获取所有照片
  const { data: photos, error } = await supabase
    .from('photos')
    .select('id, file_url, user_id')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching photos:', error.message);
    return;
  }

  console.log('找到 ' + photos.length + ' 张照片');
  console.log('并行数: ' + CONCURRENCY);
  console.log('开始下载...\n');

  let downloaded = 0;
  let failed = 0;
  const startTime = Date.now();

  // 并行下载
  const queue = [...photos];
  const workers = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const photo = queue.shift();
        if (!photo) break;

        try {
          await downloadPhoto(photo);
          downloaded++;

          if (downloaded % 50 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const speed = (downloaded / elapsed).toFixed(1);
            console.log(`进度: ${downloaded}/${photos.length} (${speed} 张/秒)`);
          }
        } catch (err) {
          failed++;
          console.error('失败 ' + photo.id.substring(0, 8) + ':', err.message);
        }
      }
    })());
  }

  await Promise.all(workers);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n完成！');
  console.log('成功: ' + downloaded);
  console.log('失败: ' + failed);
  console.log('耗时: ' + totalTime + ' 秒');
}

downloadAllPhotos().catch(console.error);
