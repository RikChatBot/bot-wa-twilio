import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// 🟢 Webhook WA
app.post("/whatsapp", (req, res) => {
  const msg = req.body.Body?.toLowerCase();

  if (msg.includes("nambah pemasukan")) {
    // kirim balasan WA dulu
    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();
    twiml.message("Siap bos, saya akan segera menelpon untuk detail pemasukan.");

    // lalu telpon kamu, arahkan ke /voice
    client.calls
      .create({
        to: process.env.MY_PHONE,
        from: process.env.TWILIO_CALLER_ID,
        url: `${process.env.PUBLIC_URL}/voice`
      })
      .then(call => console.log("Telpon dimulai:", call.sid))
      .catch(err => console.error("Gagal nelpon:", err));

    res.type("text/xml").send(twiml.toString());
  } else {
    // default reply
    const MessagingResponse = twilio.twiml.MessagingResponse;
    const twiml = new MessagingResponse();
    twiml.message("Halo, silakan ketik 'gw mo nambah pemasukan nih' untuk mulai.");
    res.type("text/xml").send(twiml.toString());
  }
});

// 🟢 Route Voice (TwiML langsung disini)
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    { language: "id-ID", voice: "alice" },
    "Halo, saya asisten keuangan Anda. Silakan sebutkan detail pemasukan dan pengeluaran yang ingin dicatat."
  );
  twiml.pause({ length: 5 });
  twiml.say(
    { language: "id-ID", voice: "alice" },
    "Terima kasih. Data akan segera saya simpan."
  );

  res.type("text/xml").send(twiml.toString());
});

// 🟢 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot jalan di port ${PORT}`);
});
