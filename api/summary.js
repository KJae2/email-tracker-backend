const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return res.status(500).json({ error: "Missing env vars." });

  try {
    const supabase = createClient(url, key);

    // Single email detail
    if (req.query.id) {
      const { data, error } = await supabase
        .from("email_events")
        .select("*")
        .eq("tracking_id", req.query.id)
        .order("opened_at", { ascending: true });

      if (error) return res.status(500).json({ error: error.message });

      if (!data || data.length === 0) {
        return res.status(200).json({
          tracking_id: req.query.id,
          status: "not_opened",
          open_count: 0,
        });
      }

      const first = data[0];
      const last = data[data.length - 1];
      const uniqueIps = [...new Set(data.map((e) => e.ip_address))];

      const devices = {};
      const locations = {};
      const browsers = {};
      data.forEach((e) => {
        devices[e.device_type] = (devices[e.device_type] || 0) + 1;
        browsers[e.browser_name] = (browsers[e.browser_name] || 0) + 1;
        const loc = e.city !== "unknown" ? e.city + ", " + e.country : e.country;
        if (loc !== "unknown") locations[loc] = (locations[loc] || 0) + 1;
      });

      let isHotLead = false;
      if (data.length >= 3) {
        for (let i = 0; i <= data.length - 3; i++) {
          const t1 = new Date(data[i].opened_at).getTime();
          const t3 = new Date(data[i + 2].opened_at).getTime();
          if (t3 - t1 <= 600000) { isHotLead = true; break; }
        }
      }

      return res.status(200).json({
        tracking_id: req.query.id,
        recipient_email: first.recipient_email,
        subject: first.subject,
        status: "opened",
        open_count: data.length,
        unique_openers: uniqueIps.length,
        first_opened: first.opened_at,
        last_opened: last.opened_at,
        is_hot_lead: isHotLead,
        devices,
        browsers,
        locations,
        timeline: data.map((e) => ({
          opened_at: e.opened_at,
          device: e.device_type,
          os: e.os_name,
          browser: e.browser_name,
          location: e.city !== "unknown" ? e.city + ", " + e.country : e.country,
          ip: e.ip_address,
        })),
      });
    }

    // All emails overview
    const { data, error } = await supabase
      .from("email_events")
      .select("tracking_id, recipient_email, subject, opened_at")
      .order("opened_at", { ascending: false })
      .limit(1000);

    if (error) return res.status(500).json({ error: error.message });

    const grouped = {};
    data.forEach((e) => {
      if (!grouped[e.tracking_id]) {
        grouped[e.tracking_id] = {
          tracking_id: e.tracking_id,
          recipient_email: e.recipient_email,
          subject: e.subject,
          open_count: 0,
          first_opened: e.opened_at,
          last_opened: e.opened_at,
        };
      }
      grouped[e.tracking_id].open_count += 1;
      if (e.opened_at < grouped[e.tracking_id].first_opened)
        grouped[e.tracking_id].first_opened = e.opened_at;
      if (e.opened_at > grouped[e.tracking_id].last_opened)
        grouped[e.tracking_id].last_opened = e.opened_at;
    });

    const emails = Object.values(grouped).sort(
      (a, b) => new Date(b.last_opened) - new Date(a.last_opened)
    );

    return res.status(200).json({
      total_emails_tracked: emails.length,
      total_open_events: data.length,
      emails,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
