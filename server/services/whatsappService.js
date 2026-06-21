const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const authDirectory = path.join(__dirname, "..", "whatsapp-auth");
const logger = pino({ level: "silent" });

let socket = null;
let status = "Disconnected";
let latestQr = null;
let reconnectTimer = null;
let manualReconnect = false;
let connectingPromise = null;
let lastError = null;

const setStatus = (nextStatus) => {
  status = nextStatus;
  console.log(`WhatsApp status: ${status}`);
};

const removeCorruptCredentials = () => {
  const credentialsFile = path.join(authDirectory, "creds.json");
  if (fs.existsSync(credentialsFile) && fs.statSync(credentialsFile).size === 0) {
    fs.rmSync(authDirectory, { recursive: true, force: true });
    console.warn("Removed incomplete WhatsApp credentials from an interrupted pairing attempt");
  }
};

const createConnection = async () => {
  clearTimeout(reconnectTimer);
  setStatus("Connecting");
  latestQr = null;
  lastError = null;

  removeCorruptCredentials();
  const { state, saveCreds } = await useMultiFileAuthState(authDirectory);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  socket.ev.on("creds.update", saveCreds);

  // ── AI Auto Reply Listener ─────────────────────────────────────────────────
  // Handles incoming personal messages only. Does NOT touch scheduler logic.
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages[0];
    if (!msg || !msg.message) return;

    const jid = msg.key.remoteJid;

    // ── Filtering ────────────────────────────────────────────────────────────
    // Ignore groups
    if (jid.endsWith("@g.us")) return;
    // Ignore status broadcasts
    if (jid === "status@broadcast") return;
    // Ignore newsletters / channels
    if (jid.includes("newsletter")) return;
    // Ignore communities
    if (jid.includes("community")) return;
    // Ignore own messages
    if (msg.key.fromMe) return;

    // Accept only text messages
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text;

    if (!text || text.trim() === "") return;

    console.log(`[AutoReply] Message received → JID: ${jid}, Text: "${text.substring(0, 60)}"`);

    // Verify it's a personal contact (@s.whatsapp.net or @lid)
    const isPersonal = jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid");
    if (!isPersonal) {
      console.log(`[AutoReply] Ignored non-personal JID: ${jid}`);
      return;
    }
    console.log(`[AutoReply] Personal contact verified → ${jid}`);

    // Resolve correct send JID (Baileys cannot send to @lid)
    let sendJid = jid;
    if (jid.endsWith("@lid")) {
      sendJid = msg.key.remoteJidAlt || `${jid.split("@")[0]}@s.whatsapp.net`;
    }
    const phone = sendJid.split("@")[0];

    // ── Load Settings ────────────────────────────────────────────────────────
    let settings;
    try {
      const { get, run, all } = require("../database/db");
      settings = await get("SELECT * FROM AutoReplySettings ORDER BY Id DESC LIMIT 1");
    } catch (dbErr) {
      console.error("[AutoReply] Failed to load settings:", dbErr.message);
      return;
    }

    console.log(`[AutoReply] Settings loaded → IsEnabled:${settings?.IsEnabled} FixedReplyEnabled:${settings?.FixedReplyEnabled} AlwaysSendFixedMessage:${settings?.AlwaysSendFixedMessage} AIReplyEnabled:${settings?.AIReplyEnabled}`);

    // Check master toggle
    if (!settings || settings.IsEnabled !== 1) {
      console.log("[AutoReply] Auto reply is disabled. Skipping.");
      return;
    }

    const { get: dbGet, run: dbRun } = require("../database/db");

    let fixedReplySent = null;
    let aiReplySent = null;

    // ── Step 1: Send fixed message (if enabled and AlwaysSendFixedMessage=ON) ─
    if (settings.FixedReplyEnabled === 1 && settings.AlwaysSendFixedMessage === 1) {
      try {
        const fixedText = settings.FixedReplyText ||
          "Hi 👋\n\nThank you for contacting me.\n\nI have received your message and will respond as soon as possible.";
        await socket.sendMessage(sendJid, { text: fixedText });
        fixedReplySent = fixedText;
        console.log(`[AutoReply] Fixed reply sent → ${sendJid}`);
      } catch (fixedErr) {
        console.error(`[AutoReply] Failed to send fixed reply to ${sendJid}:`, fixedErr.message);
      }
    }

    // ── Step 2: Wait 3 seconds before AI reply ───────────────────────────────
    if (settings.AIReplyEnabled === 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    // ── Step 3: Generate and send AI reply ───────────────────────────────────
    if (settings.AIReplyEnabled === 1) {
      try {
        const { generateReply } = require("./aiService");
        const aiText = await generateReply(text);
        await socket.sendMessage(sendJid, { text: aiText });
        aiReplySent = aiText;
        console.log(`[AutoReply] AI reply sent → ${sendJid}: "${aiText.substring(0, 60)}"`);
      } catch (aiErr) {
        console.error(`[AutoReply] AI reply failed for ${sendJid}:`, aiErr.message);
      }
    }

    // ── Step 4: Save to history ───────────────────────────────────────────────
    if (fixedReplySent || aiReplySent) {
      try {
        await dbRun(
          `INSERT INTO AutoReplyHistory (Phone, ContactName, IncomingMessage, FixedReply, AIReply, CreatedOn)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [phone, null, text, fixedReplySent, aiReplySent, new Date().toISOString()]
        );
        console.log(`[AutoReply] History saved → Phone: ${phone}`);
      } catch (histErr) {
        console.error("[AutoReply] Failed to save history:", histErr.message);
      }
    }
  });
  // ── End AI Auto Reply Listener ─────────────────────────────────────────────


  socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      latestQr = await QRCode.toDataURL(qr);
      setStatus("QR Available");
    }

    if (connection === "open") {
      latestQr = null;
      manualReconnect = false;
      lastError = null;
      setStatus("Connected");
    }

    if (connection === "close") {
      latestQr = null;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const reason = lastDisconnect?.error?.message || "Unknown connection error";
      lastError = statusCode ? `${reason} (${statusCode})` : reason;
      console.warn(`WhatsApp connection closed${statusCode ? ` (${statusCode})` : ""}: ${reason}`);
      setStatus(loggedOut ? "Logged Out" : "Disconnected");

      if (!loggedOut || manualReconnect) {
        reconnectTimer = setTimeout(() => connect().catch(console.error), 5000);
      }
    }
  });
};

const connect = async () => {
  if (status === "Connected") return;
  if (connectingPromise) return connectingPromise;

  connectingPromise = createConnection().finally(() => {
    connectingPromise = null;
  });
  return connectingPromise;
};

const reconnect = async () => {
  manualReconnect = true;
  const resetPairing = status !== "Connected";
  if (socket) {
    try {
      socket.end(new Error("Manual reconnect"));
    } catch (error) {
      console.warn("Unable to close existing WhatsApp socket:", error.message);
    }
  }
  if (resetPairing) {
    fs.rmSync(authDirectory, { recursive: true, force: true });
    console.log("Cleared incomplete WhatsApp session for fresh QR pairing");
  }
  setStatus("Disconnected");
  await connect();
};

const sendMessage = async (phone, message) => {
  if (!socket || status !== "Connected") {
    const error = new Error("WhatsApp is not connected");
    error.statusCode = 503;
    console.error(`[WhatsApp] ❌ sendMessage failed: WhatsApp not connected. Status: ${status}`);
    throw error;
  }
  const jid = `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
  console.log(`[WhatsApp] ⏳ sendMessage → JID: ${jid}, Text: "${message.substring(0, 60)}${message.length > 60 ? "..." : ""}"`);
  try {
    const result = await socket.sendMessage(jid, { text: message });
    console.log(`[WhatsApp] ✅ sendMessage success → JID: ${jid}`);
    return result;
  } catch (err) {
    console.error(`[WhatsApp] ❌ sendMessage failed for JID ${jid}:`, err.message);
    throw err;
  }
};

const getStatus = () => ({ status, hasQr: Boolean(latestQr), lastError });
const getQr = () => latestQr;

module.exports = { connect, reconnect, sendMessage, getStatus, getQr };
