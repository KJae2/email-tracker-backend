const { createClient } = require("@supabase/supabase-js");
const UAParser = require("ua-parser-js");

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Gmail/Google image proxy signatures
const GOOGLE_PROXY_UA = [
  "googleimageproxy", "google-smtp-sts", "feedfetcher-google",
  "googleassociationservice", "via ggpht.com", "google-http-java-client",
  "google favicon",
];

// Google IP prefixes (Mountain View proxy servers)
const GOOGLE_IP_PREFIXES = [
  "66.102.", "66.249.", "64.233.", "72.14.", "74.125.",
  "108.177.", "142.250.", "172.217.", "173.194.", "209.85.",
  "216.58.", "216.239.", "35.190.", "35.191.", "35.192.",
  "35.193.", "35.194.", "35.195.", "35.196.", "35.197.",
  "35.198.", "35.199.", "35.200.", "35.201.", "35.202.",
  "35.203.", "35.204.", "35.205.", "35.206.", "35.207.",
  "35.208.", "35.209.", "35.210.", "35.211.", "35.212.",
  "35.213.", "35.214.", "35.215.", "35.216.", "35.217.",
  "35.219.", "35.220.",
];

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.headers["x-real-ip"] || req.connection?.remoteAddress || "unknown";
}

function isGoogleProxy(ip, ua) {
  if (ua) {
    const low = ua.toLowerCase();
    for (const p of GOOGLE_PROXY_UA) {
      if (low.includes(p)) return true;
    }
  }
  if (ip && ip !== "unknown") {
    for (const prefix of GOOGLE_IP_PREFIXES) {
      if (ip.startsWith(prefix)) return true;
    }
  }
  return false;
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
    const resp = await fetch("http://ip-api.com/json/" + ip + "?fields=city,country,status", { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return { city: "unknown", country: "unknown" };
    const data = await resp.json();
    if (data.status === "success") return { city: data.city || "unknown", country: data.country || "unknown" };
  } catch (e) {}
  return { city: "unknown", country: "unknown" };
}

async function isDuplicate(supabase, trackingId, ip) {
  try {
    const since = new Date(Date.now() - 10000).toISOString();
    const { data } = await supabase
      .from("email_events").select("id")
      .eq("tracking_id", trackingId).eq("ip_address", ip)
      .gte("opened_at", since).limit(1);
    return data && data.length > 0;
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Content-Length", TRANSPARENT_GIF.length);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const trackingId = req.query.id || "unknown";
  const recipientEmail = req.query.to || "unknown";
  const subject = req.query.subject || "unknown";
  const senderIp = req.query.sip || "";

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (url && key) {
      const supabase = createClient(url, key);
      const ip = getClientIp(req);
      const uaString = req.headers["user-agent"] || "unknown";

      // FILTER 1: Gmail/Google image proxy — not a real open
      if (isGoogleProxy(ip, uaString)) {
        return res.status(200).end(TRANSPARENT_GIF);
      }

      // FILTER 2: Sender's own IP (auto-detected by extension)
      if (senderIp && ip === senderIp) {
        return res.status(200).end(TRANSPARENT_GIF);
      }

      // FILTER 3: Manually excluded IPs (env var, comma-separated)
      const excludeList = (process.env.EXCLUDE_IPS || "").split(",").map(s => s.trim()).filter(Boolean);
      if (excludeList.includes(ip)) {
        return res.status(200).end(TRANSPARENT_GIF);
      }

      // FILTER 4: Duplicate (same email + IP within 10 seconds)
      if (await isDuplicate(supabase, trackingId, ip)) {
        return res.status(200).end(TRANSPARENT_GIF);
      }

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
