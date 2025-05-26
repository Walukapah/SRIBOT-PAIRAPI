const express = require('express');
const fs = require('fs');
const { makeid } = require('./id');
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

const app = express();
const port = process.env.PORT || 3000;

app.get('/code', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    
    if (!num) {
        return res.status(400).json({ error: "Phone number is required" });
    }

    async function generatePairingCode() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        
        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Desktop")
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                
                if (!res.headersSent) {
                    return res.json({ code });
                }
            }

            sock.ev.on('creds.update', saveCreds);
            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === "open") {
                    await delay(5000);
                    let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                    await delay(800);
                    let b64data = Buffer.from(data).toString('base64');
                    
                    let session = await sock.sendMessage(sock.user.id, { text: b64data });
                    
                    const successMessage = `
*Pair Code Connected by YOUR_BOT_NAME*
*Made With ❤️*

╔════◇
║ *『 WOW YOU'VE CHOSEN YOUR_BOT 』*
║ _You Have Completed the First Step to Deploy a Whatsapp Bot._
╚════════════════════════╝
╔═════◇
║  『••• Visit For Help •••』
║❒ *Youtube:* youtube.com/@yourchannel
║❒ *Owner:* https://wa.me/yournumber
║❒ *Repo:* https://github.com/yourrepo
║❒ *Support Group:* https://chat.whatsapp.com/yourgroup
╚════════════════════════╝

_Don't Forget To Give Star To My Repo_`;
                    
                    await sock.sendMessage(sock.user.id, { text: successMessage }, { quoted: session });
                    await delay(100);
                    await sock.ws.close();
                    return removeFile('./temp/' + id);
                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    await delay(10000);
                    generatePairingCode();
                }
            });
        } catch (err) {
            console.error("Error generating pairing code:", err);
            removeFile('./temp/' + id);
            if (!res.headersSent) {
                return res.status(500).json({ code: "Service Unavailable" });
            }
        }
    }
    
    return generatePairingCode();
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app;
