const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(500).json({ error: "Missing env vars." });

  try {
    const supabase = createClient(url, key);
    let query = supabase
      .from("email_events")
      .select("*")
      .order("opened_at", { ascending: false });

    if (req.query.id) query = query.eq("tracking_id", req.query.id);
    if (req.query.to) query = query.eq("recipient_email", req.query.to);

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    query = query.limit(limit);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ count: data.length, events: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
