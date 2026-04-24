# 🤖 AMBI WhatsApp Bot

Jarvis-style WhatsApp automation using Node.js + Puppeteer. Automatically opens WhatsApp Web, finds the contact, and sends the message.

---

## 📁 File Structure

```
whatsapp-bot/
├── index.js        ← Core automation (Puppeteer)
├── server.js       ← Express API server
├── parser.js       ← Natural language command parser
├── contacts.json   ← Name → Phone number mapping
├── package.json
└── wa_session/     ← Auto-created (saves WhatsApp login)
```

---

## ⚙️ Setup (One-Time)

```bash
# Step 1: Go to whatsapp-bot folder
cd whatsapp-bot

# Step 2: Install dependencies
npm install
```

---

## 🚀 Run the Bot

### Option A: API Server (Recommended)
```bash
node server.js
```
Server runs at **http://localhost:4000**

### Option B: Direct CLI
```bash
node index.js "Rahul" "Hello bro!"
```

---

## 📡 API Usage

### Send a message
```
POST http://localhost:4000/send
Content-Type: application/json

{
  "name": "Rahul",
  "message": "Hello bro!"
}
```

### Parse natural language command
```
POST http://localhost:4000/parse
Content-Type: application/json

{
  "command": "Send WhatsApp message to Rahul: Hello bro!"
}
```

### Health check
```
GET http://localhost:4000/health
```

---

## 📱 First-Time Login

1. Run `node server.js`
2. A Chrome window will open showing **WhatsApp Web QR code**
3. Open WhatsApp on your phone → Linked Devices → Scan QR
4. Done! ✅ Session is saved in `wa_session/` folder — no need to scan again.

---

## 📒 Add Contacts

Edit `contacts.json`:
```json
{
  "Rahul": "919876543210",
  "Mom": "919000000001",
  "Best Friend": "919123456789"
}
```
> Always include country code (91 for India)

---

## 🔗 Integration with AMBI

AMBI voice assistant calls `POST /send` on this bot automatically when you say:
> *"Hey Ambi, send WhatsApp message to Rahul: I'll be late"*

