// api/check-training.js — Check voice model training status on Replicate
// Called by frontend to poll training progress
// Keys: REPLICATE_API_TOKEN

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const REP = process.env.REPLICATE_API_TOKEN;
  if (!REP) {
    return res.status(500).json({ error: 'REPLICATE_API_TOKEN not configured' });
  }

  try {
    // Get prediction ID from query or body
    const predictionId = req.query?.predictionId || req.body?.predictionId;

    if (!predictionId) {
      return res.status(400).json({ error: 'predictionId required' });
    }

    console.log('🔍 Checking training status:', predictionId);

    const r = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${REP}` },
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('❌ Status check failed:', errText.substring(0, 200));
      return res.status(500).json({ error: 'Failed to check training status' });
    }

    const pred = await r.json();
    const status = pred.status; // starting, processing, succeeded, failed, canceled

    console.log('   Status:', status);

    if (status === 'succeeded' && pred.output) {
      // Training complete! Output is a URL to the trained model zip
      const modelUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      console.log('✅ Training complete! Model:', modelUrl?.substring(0, 80));

      return res.status(200).json({
        success: true,
        status: 'COMPLETE',
        modelUrl,
        message: 'Voice model trained successfully!',
      });
    }

    if (status === 'failed') {
      console.log('❌ Training failed:', pred.error);
      return res.status(200).json({
        success: false,
        status: 'FAILED',
        error: pred.error || 'Training failed',
        message: 'Voice training failed. You can still use Seed-VC for instant voice cloning.',
      });
    }

    if (status === 'canceled') {
      return res.status(200).json({
        success: false,
        status: 'CANCELED',
        message: 'Training was canceled.',
      });
    }

    // Still processing
    // Estimate progress based on logs if available
    let progress = 10;
    if (pred.logs) {
      const epochMatch = pred.logs.match(/Epoch (\d+)/g);
      if (epochMatch) {
        const lastEpoch = parseInt(epochMatch[epochMatch.length - 1].match(/\d+/)[0]);
        progress = Math.min(10 + (lastEpoch / 30) * 85, 95); // 30 epochs total
      }
    }

    return res.status(200).json({
      success: true,
      status: 'TRAINING',
      progress: Math.round(progress),
      message: status === 'starting' ? 'Warming up training server...' : 'Training your voice model...',
    });

  } catch (error) {
    console.error('❌ check-training error:', error);
    return res.status(500).json({ error: error.message });
  }
};
