const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      status: "error",
      message: "Missing environment variables. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Vercel.",
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from("email_events").select("id").limit(1);

    if (error) {
      return res.status(500).json({
        status: "error",
        message: "Supabase query failed: " + error.message,
        hint: "Run schema.sql in Supabase SQL Editor first.",
      });
    }

    return res.status(200).json({
      status: "ok",
      version: "2.0.0",
      message: "Backend is live and Supabase is connected!",
      features: ["ua-parsing", "ip-geolocation", "dedup-rate-limit", "realtime-ready"],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
