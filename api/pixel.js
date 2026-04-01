const { createClient } = require("@supabase/supabase-js");
const UAParser = require("ua-parser-js");

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.connection?.remoteAddress || "unknown";
}

function parseUA(uaString) {
  const parser = new UAParser(uaString);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();
  let deviceType = "desktop";
  if (device.type === "mobile") deviceType = "mobile";
  else if (device.type === "tablet") deviceType = "tablet";
  return {
    device_type: deviceType,
    os_name: os.name ? (os.name + " " + (os.version || "")).trim() : "unknown",
    browser_name: browser.name ? (browser.name + " " + (browser.version || "")).trim() : "unknown",
  };
}

async function geolocate(ip) {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip.startsWith("192.168.") || ip === "::1") {
    return { city: "unknown", country: "unknown" };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch("http://ip-api.com/json/" + ip + "?fields=city,country,status", {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { city: "unknown", country: "unknown" };
    const data = await resp.json();
    if (data.status === "success") {
      return { city: data.city || "unknown", country: data.country || "unknown" };
    }
  } catch (e) {}
  return { city: "unknown", country: "unknown" };
}

async function isDuplicate(supabase, trackingId, ip) {
  try {
    const since = new Date(Date.now() - 10000).toISOString();
    const { data } = await supabase
      .from("email_events")
      .select("id")
      .eq("tracking_id", trackingId)
      .eq("ip_address", ip)
      .gte("opened_at", since)
      .limit(1);
    return data && data.length > 0;
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Content-Length", TRANSPARENT_GIF.length);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vary", "Accept-Encoding");

  const trackingId = req.query.id || "unknown";
  const recipientEmail = req.query.to || "unknown";
  const subject = req.query.subject || "unknown";

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (url && key) {
      const supabase = createClient(url, key);
      const ip = getClientIp(req);

      if (await isDuplicate(supabase, trackingId, ip)) {
        return res.status(200).end(TRANSPARENT_GIF);
      }

      const uaString = req.headers["user-agent"] || "unknown";
      const ua = parseUA(uaString);
      const loc = await geolocate(ip);

      await supabase.from("email_events").insert({
        tracking_id: trackingId,
        recipient_email: recipientEmail,
        subject: subject,
        event_type: "open",
        user_agent: uaString,
        ip_address: ip,
        device_type: ua.device_type,
        os_name: ua.os_name,
        browser_name: ua.browser_name,
        city: loc.city,
        country: loc.country,
        opened_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Pixel error:", err.message);
  }

  return res.status(200).end(TRANSPARENT_GIF);
};
