import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import schedule from "node-schedule";
import twilio from "twilio";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ====== ENV ======
const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH;
const TWILIO_PHONE = process.env.TWILIO_PHONE;
const MY_PHONE = process.env.MY_PHONE;
const PUBLIC_URL = process.env.PUBLIC_URL; // Railway domain (misal https://xxx.up.railway.app)

const client = twilio(TWILIO_SID, TWILIO_AUTH);

// ====== Penyimpanan sementara ======
let finances = []; // { type, amount, desc, date }
let events = [];   // { id, title, date, job }

// ====== Helper ======
function sendWhatsApp(msg) {
  return fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: FONNTE_TOKEN,
    },
    body: new URLSearchParams({
      target: MY_PHONE,
      message: msg,
    }),
  });
}

function makeCall(message) {
  return client.calls.create({
    to: MY_PHONE,
    from: TWILIO_PHONE,
    url: `${PUBLIC_URL}/voice?msg=${encodeURIComponent(message)}`,
  });
}

// ====== Twilio Voice endpoint ======
app.get("/voice", (req, res) => {
  const msg = req.query.msg || "Hello, ini panggilan otomatis.";
  const twiml = `
    <Response>
      <Say language="id-ID">${msg}</Say>
    </Response>`;
  res.type("text/xml");
  res.send(twiml);
});

// ====== Webhook Fonnte ======
app.post("/webhook", async (req, res) => {
  const text = (req.body.text || "").trim().toLowerCase();
  let reply = "Perintah tidak dikenal.";

  try {
    // ========== Telpon ==========
    if (text.startsWith("telpon saya")) {
      const msg = text.replace("telpon saya", "").trim() || "Jangan lupa kegiatan kamu!";
      await makeCall(msg);
      reply = `📞 Oke, saya akan telpon kamu dengan pesan: ${msg}`;
    }

    // ========== Acara ==========
    else if (text.startsWith("acara;")) {
      const parts = req.body.text.split(";");
      if (parts.length >= 3) {
        const title = parts[1];
        const date = new Date(parts[2]);

        const id = events.length + 1;
        const job = schedule.scheduleJob(date, () => {
          sendWhatsApp(`⏰ Reminder: ${title}`);
          makeCall(`Jangan lupa acara: ${title}`);
        });

        events.push({ id, title, date, job });
        reply = `✅ Acara "${title}" tersimpan untuk ${date}`;
      } else {
        reply = "Format salah. Gunakan: acara;Judul;YYYY-MM-DD HH:mm";
      }
    }

    else if (text === "list acara") {
      reply = events.length
        ? events.map(e => `${e.id}. ${e.title} - ${e.date}`).join("\n")
        : "Belum ada acara.";
    }

    else if (text.startsWith("hapus acara;")) {
      const id = parseInt(text.split(";")[1]);
      const idx = events.findIndex(e => e.id === id);
      if (idx >= 0) {
        events[idx].job.cancel();
        events.splice(idx, 1);
        reply = `🗑️ Acara ${id} dihapus.`;
      } else {
        reply = "Acara tidak ditemukan.";
      }
    }

    // ========== Keuangan ==========
    else if (text.startsWith("pemasukan;") || text.startsWith("pengeluaran;")) {
      const parts = req.body.text.split(";");
      if (parts.length >= 3) {
        const type = text.startsWith("pemasukan;") ? "pemasukan" : "pengeluaran";
        const amount = parseFloat(parts[1]);
        const desc = parts[2];
        const date = new Date();

        finances.push({ type, amount, desc, date });
        reply = `✅ ${type} Rp${amount} dicatat (${desc})`;
      } else {
        reply = "Format salah. Gunakan: pemasukan;jumlah;keterangan";
      }
    }

    else if (text.startsWith("laporan")) {
      const parts = req.body.text.split(";");
      let filterMonth = null;
      if (parts.length >= 2) filterMonth = parts[1];

      let inc = 0, exp = 0;
      finances.forEach(f => {
        const month = `${f.date.getFullYear()}-${String(f.date.getMonth() + 1).padStart(2,"0")}`;
        if (!filterMonth || month === filterMonth) {
          if (f.type === "pemasukan") inc += f.amount;
          else exp += f.amount;
        }
      });

      reply = `📊 Laporan${filterMonth ? " " + filterMonth : ""}:\nPemasukan: Rp${inc}\nPengeluaran: Rp${exp}\nSaldo: Rp${inc - exp}`;
    }

    // Kirim balasan ke WA via Fonnte
    await sendWhatsApp(reply);
  } catch (err) {
    console.error("Error:", err);
  }

  res.sendStatus(200);
});

// ====== Start ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
