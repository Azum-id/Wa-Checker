import express from "express";
import fs from "fs";
import pino from "pino";
import chalk from "chalk";
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  Browsers,
} from "@whiskeysockets/baileys";

const PORT = 1408;
const SESSION_FILE = "./session.json";
const LOG_LEVEL = "error";

const logger = pino({ level: LOG_LEVEL });

const store = makeInMemoryStore({ logger });
if (fs.existsSync(SESSION_FILE)) {
  store.readFromFile(SESSION_FILE);
}

setInterval(() => {
  try {
    store.writeToFile(SESSION_FILE);
  } catch (err) {
    console.error("Failed to save session file:", err.message);
  }
}, 10_000);

let socket;

const connectToWhatsApp = async () => {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const { version } = await fetchLatestBaileysVersion();

    socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      version,
      logger,
      printQRInTerminal: true,
      browser: Browsers.macOS("Chrome"),
    });

    store.bind(socket.ev);

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== 401;
        if (shouldReconnect) {
          console.log(chalk.yellow("Reconnecting to WhatsApp..."));
          connectToWhatsApp();
        } else {
          console.log(chalk.red("Connection closed. Logged out."));
        }
      } else if (connection === "open") {
        console.log(chalk.green("Connected to WhatsApp!"));
      }
    });
  } catch (err) {
    console.error("Failed to connect to WhatsApp:", err.message);
  }
};

const checkWhatsAppNumber = async (number) => {
  if (!socket) {
    throw new Error("WhatsApp socket is not connected.");
  }

  try {
    const [result] = await socket.onWhatsApp(number);
    if (result) {
      fs.appendFileSync("valid_number.txt", `${number}\n`);
      return { exists: true, jid: result.jid };
    } else {
      fs.appendFileSync("invalid_number.txt", `${number}\n`);
      return { exists: false, message: "Number is not a WhatsApp user." };
    }
  } catch (err) {
    throw new Error(err.message);
  }
};

connectToWhatsApp();

const app = express();
app.use(express.json());

const jsonResponse = (res, status, success, message, data = null) => {
  res.status(status).json({
    success,
    message,
    data,
  });
};

app.post("/check-number", async (req, res) => {
  const { number } = req.body;

  if (!number) {
    return jsonResponse(res, 400, false, "Number is required.");
  }

  try {
    const result = await checkWhatsAppNumber(number);
    jsonResponse(res, 200, true, "Number check successful.", result);
  } catch (err) {
    if (err.message === "WhatsApp socket is not connected.") {
      return jsonResponse(res, 503, false, "WhatsApp is not connected.");
    }
    return jsonResponse(res, 500, false, "An unexpected error occurred.", {
      error: err.message,
    });
  }
});

app.get("/check-number", async (req, res) => {
  const { number } = req.query;

  if (!number) {
    return jsonResponse(res, 400, false, "Number is required.");
  }

  try {
    const result = await checkWhatsAppNumber(number);
    jsonResponse(res, 200, true, "Number check successful.", result);
  } catch (err) {
    if (err.message === "WhatsApp socket is not connected.") {
      return jsonResponse(res, 503, false, "WhatsApp is not connected.");
    }
    return jsonResponse(res, 500, false, "An unexpected error occurred.", {
      error: err.message,
    });
  }
});

app.use((req, res) => {
  jsonResponse(res, 404, false, "Endpoint not found.");
});

app.listen(PORT, () => {
  console.log(chalk.green(`API server running on http://localhost:${PORT}`));
});
