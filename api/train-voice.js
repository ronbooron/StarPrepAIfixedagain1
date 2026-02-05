// api/train-voice.js — Train a custom RVC voice model on Replicate
// Takes a WAV audio file (base64), packages it into a zip, uploads, and starts training.
// Training takes ~5-10 minutes. Frontend polls check-training.js for status.
//
// Keys: REPLICATE_API_TOKEN

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const REP = process.env.REPLICATE_API_TOKEN;
  if (!REP) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN not configured' });
  }

  try {
    const { audioBase64, contentType = 'audio/wav', fileName = 'voice-sample.wav' } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 required' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const audioSizeKB = Math.round(audioBuffer.length / 1024);
    console.log(`🎓 TRAIN VOICE: ${audioSizeKB} KB, ${contentType}`);

    if (audioSizeKB < 10) {
      return res.status(400).json({ error: 'Audio too short — need at least 10 seconds' });
    }

    // ── Step 1: Create a zip containing the audio file ──
    console.log('📦 Creating dataset zip...');
    const zipBuffer = createMinimalZip('dataset/voice-sample.wav', audioBuffer);
    console.log(`   Zip size: ${Math.round(zipBuffer.length / 1024)} KB`);

    // ── Step 2: Upload zip to Replicate Files API ──
    console.log('📤 Uploading zip to Replicate...');
    const fd = new FormData();
    fd.append('content', new Blob([zipBuffer], { type: 'application/zip' }), 'voice-dataset.zip');

    const uploadRes = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${REP}` },
      body: fd,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('❌ Upload failed:', errText.substring(0, 200));
      return res.status(500).json({ error: 'Failed to upload training data' });
    }

    const uploadData = await uploadRes.json();
    const zipUrl = uploadData.urls?.get || uploadData.url;
    console.log('✅ Uploaded:', zipUrl?.substring(0, 80));

    if (!zipUrl) {
      return res.status(500).json({ error: 'No URL returned from upload' });
    }

    // ── Step 3: Start RVC model training ──
    console.log('🚀 Starting RVC training...');
    const trainRes = await fetch(
      'https://api.replicate.com/v1/models/replicate/train-rvc-model/predictions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REP}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            dataset_zip: zipUrl,
            sample_rate: '48k',
            version: 'v2',
            f0method: 'rmvpe_gpu',
            epoch: 30,       // Lower epochs for faster training, still good quality
            batch_size: 7,
          },
        }),
      }
    );

    if (!trainRes.ok) {
      const errText = await trainRes.text();
      console.error('❌ Training start failed:', errText.substring(0, 200));
      return res.status(500).json({ error: 'Failed to start voice training' });
    }

    const trainData = await trainRes.json();
    const predictionId = trainData.id;
    console.log('✅ Training started! Prediction ID:', predictionId);

    return res.status(200).json({
      success: true,
      predictionId,
      status: 'TRAINING',
      message: 'Voice model training started! This takes about 5-10 minutes.',
    });

  } catch (error) {
    console.error('❌ train-voice error:', error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '50mb' } } };

// ══════════════════════════════════════════════════
// Minimal ZIP file creator (no dependencies needed)
// Creates a valid zip with a single uncompressed file
// ══════════════════════════════════════════════════
function createMinimalZip(fileName, fileData) {
  const fileNameBytes = Buffer.from(fileName, 'utf8');
  const crc = crc32(fileData);
  const fileSize = fileData.length;

  // Local file header (30 + filename + data)
  const localHeaderSize = 30 + fileNameBytes.length;
  // Central directory (46 + filename)
  const centralDirSize = 46 + fileNameBytes.length;
  // End of central directory (22)
  const endRecordSize = 22;

  const totalSize = localHeaderSize + fileSize + centralDirSize + endRecordSize;
  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // ── Local File Header ──
  buf.writeUInt32LE(0x04034b50, offset); offset += 4;  // Signature
  buf.writeUInt16LE(20, offset); offset += 2;           // Version needed
  buf.writeUInt16LE(0, offset); offset += 2;            // General purpose flags
  buf.writeUInt16LE(0, offset); offset += 2;            // Compression: stored
  buf.writeUInt16LE(0, offset); offset += 2;            // Mod time
  buf.writeUInt16LE(0x5421, offset); offset += 2;       // Mod date (2022-01-01)
  buf.writeUInt32LE(crc, offset); offset += 4;          // CRC-32
  buf.writeUInt32LE(fileSize, offset); offset += 4;     // Compressed size
  buf.writeUInt32LE(fileSize, offset); offset += 4;     // Uncompressed size
  buf.writeUInt16LE(fileNameBytes.length, offset); offset += 2; // Filename length
  buf.writeUInt16LE(0, offset); offset += 2;            // Extra field length
  fileNameBytes.copy(buf, offset); offset += fileNameBytes.length;

  // ── File Data ──
  const localFileDataOffset = offset;
  fileData.copy(buf, offset); offset += fileSize;

  // ── Central Directory Entry ──
  const centralDirOffset = offset;
  buf.writeUInt32LE(0x02014b50, offset); offset += 4;  // Signature
  buf.writeUInt16LE(20, offset); offset += 2;           // Version made by
  buf.writeUInt16LE(20, offset); offset += 2;           // Version needed
  buf.writeUInt16LE(0, offset); offset += 2;            // General purpose flags
  buf.writeUInt16LE(0, offset); offset += 2;            // Compression: stored
  buf.writeUInt16LE(0, offset); offset += 2;            // Mod time
  buf.writeUInt16LE(0x5421, offset); offset += 2;       // Mod date
  buf.writeUInt32LE(crc, offset); offset += 4;          // CRC-32
  buf.writeUInt32LE(fileSize, offset); offset += 4;     // Compressed size
  buf.writeUInt32LE(fileSize, offset); offset += 4;     // Uncompressed size
  buf.writeUInt16LE(fileNameBytes.length, offset); offset += 2; // Filename length
  buf.writeUInt16LE(0, offset); offset += 2;            // Extra field length
  buf.writeUInt16LE(0, offset); offset += 2;            // Comment length
  buf.writeUInt16LE(0, offset); offset += 2;            // Disk number start
  buf.writeUInt16LE(0, offset); offset += 2;            // Internal attrs
  buf.writeUInt32LE(0, offset); offset += 4;            // External attrs
  buf.writeUInt32LE(0, offset); offset += 4;            // Local header offset
  fileNameBytes.copy(buf, offset); offset += fileNameBytes.length;

  // ── End of Central Directory ──
  buf.writeUInt32LE(0x06054b50, offset); offset += 4;  // Signature
  buf.writeUInt16LE(0, offset); offset += 2;            // Disk number
  buf.writeUInt16LE(0, offset); offset += 2;            // Central dir disk
  buf.writeUInt16LE(1, offset); offset += 2;            // Entries on this disk
  buf.writeUInt16LE(1, offset); offset += 2;            // Total entries
  buf.writeUInt32LE(centralDirSize, offset); offset += 4; // Central dir size
  buf.writeUInt32LE(centralDirOffset, offset); offset += 4; // Central dir offset
  buf.writeUInt16LE(0, offset); offset += 2;            // Comment length

  return buf;
}

// ── CRC-32 computation ──
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
