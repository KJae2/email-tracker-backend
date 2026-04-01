module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const fwd = req.headers["x-forwarded-for"];
  const ip = typeof fwd === "string" ? fwd.split(",")[0].trim()
    : req.headers["x-real-ip"] || req.connection?.remoteAddress || "unknown";

  return res.status(200).json({ ip: ip });
};
