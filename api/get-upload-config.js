// api/get-upload-config.js — Returns upload service status (no secrets exposed)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  return res.status(200).json({
    uploadcare: !!process.env.UPLOADCARE_PUBLIC_KEY,
    replicate: !!process.env.REPLICATE_API_TOKEN,
    kie: !!process.env.KIE_API_KEY,
  });
};
