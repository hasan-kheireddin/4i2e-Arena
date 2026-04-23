# Fire Arena - Network Access Guide

How to connect to Fire Arena from different devices on the same network

## Table of Contents

- [Prerequisites](#prerequisites)
- [Finding Your Server's IP Address](#finding-your-servers-ip-address)
- [Connecting from Different Devices](#connecting-from-different-devices)
- [Platform-Specific Instructions](#platform-specific-instructions)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)

---

## Prerequisites

Before connecting from another device, ensure:

✅ The main server is running and accessible  
✅ Both devices are connected to the **same WiFi network** or network segment  
✅ Firewall rules allow traffic on port `8443` (HTTPS)  
✅ Devices can reach each other on the local network  

---

## Finding Your Server's IP Address

### On Windows (Server Machine)

1. Open **Command Prompt** or **PowerShell**
2. Type: `ipconfig`
3. Look for **"IPv4 Address"** under your network adapter
4. Example: `192.168.1.100`

**Alternative:** Settings → Network & Internet → WiFi → Properties → scroll to "IPv4 address"

### On macOS (Server Machine)

1. Open **System Preferences** → **Network**
2. Select your connected network
3. Click **Advanced** → **TCP/IP**
4. Look for **"IPv4 Address"**
5. Example: `192.168.1.100`

**Alternative:** Open Terminal and type: `ifconfig | grep "inet "`

### On Linux (Server Machine)

Open Terminal and run:
```bash
hostname -I
```
Or:
```bash
ip addr show
```

Look for an address starting with `192.168.x.x` or `10.x.x.x`

---

## Connecting from Different Devices

### General URL Format

Once you have the server's IP address, use this format:

```
https://YOUR_SERVER_IP:8443
```

**Example:**
```
https://192.168.1.100:8443
```

> ⚠️ **Note:** Your browser may show a security warning about the SSL certificate (self-signed). This is normal for local development. Click **"Continue anyway"** or **"Accept risk"** to proceed.

---

## Platform-Specific Instructions

### 📱 iOS (iPhone/iPad)

1. **Open Safari** on your iOS device
2. Tap the **address bar** at the top
3. Type: `https://192.168.1.100:8443` (replace with your server IP)
4. Press **Go**
5. If prompted about certificate, tap **"Details"** → **"Visit Website"**
6. You may need to confirm the security exception

**Bookmark for Quick Access:**
- Once loaded, tap the **Share icon** (↗)
- Select **"Add Bookmark"**
- Name it "Fire Arena" and save

### 📱 Android (Phone/Tablet)

1. **Open Chrome** (or your preferred browser)
2. Tap the **address bar**
3. Type: `https://192.168.1.100:8443` (replace with your server IP)
4. Press **Enter**
5. Tap **"ADVANCED"** → **"Proceed to 192.168.1.100 (unsafe)"**

**Bookmark for Quick Access:**
- Once loaded, tap the **menu icon** (⋮)
- Select **"Bookmark this page"**
- Name it "Fire Arena" and save to home screen

### 💻 Windows (Desktop/Laptop)

1. **Open your browser** (Chrome, Firefox, Edge, etc.)
2. Click the **address bar**
3. Type: `https://192.168.1.100:8443` (replace with your server IP)
4. Press **Enter**
5. If you see a security warning:
   - **Chrome/Edge:** Click **"Advanced"** → **"Proceed to 192.168.1.100"**
   - **Firefox:** Click **"Advanced"** → **"Accept the Risk and Continue"**

**Create a Shortcut:**
1. Right-click on the page → **"Create shortcut"**
2. Check **"Open in new window"**
3. Name it "Fire Arena" and save to Desktop

### 🍎 macOS (Desktop/Laptop)

1. **Open Safari** (or Chrome/Firefox)
2. Click the **address bar**
3. Type: `https://192.168.1.100:8443` (replace with your server IP)
4. Press **Enter**
5. If prompted about certificate:
   - Click **"Show Certificate"** → **"Trust"** (if available)
   - Or simply proceed past the warning

**Add to Favorites:**
- Press **Cmd + D**
- Name it "Fire Arena" and save

### 🐧 Linux (Desktop/Laptop)

1. **Open your browser** (Firefox, Chromium, etc.)
2. Click the **address bar**
3. Type: `https://192.168.1.100:8443` (replace with your server IP)
4. Press **Enter**
5. Accept the self-signed certificate warning

---

## Troubleshooting

### ❌ "Cannot reach the server" or "Connection refused"

**Solution:**
1. Verify the server is running: `docker compose ps`
2. Check if the backend is healthy: look for "Up" status
3. Confirm the IP address is correct
4. Try pinging the server: `ping 192.168.1.100`
5. Restart containers: `docker compose restart`

### ❌ "Network unreachable"

**Solution:**
1. Ensure both devices are on the **same network** (same WiFi)
2. Check WiFi passwords match
3. Verify network security settings aren't blocking local traffic
4. Restart your router

### ❌ "This connection is not private" or Certificate error persists

**Solution:**
1. This is normal for self-signed certificates
2. Proceed anyway (browser should have an option)
3. Clear browser cache: Settings → Privacy → Clear Browsing Data
4. Try in an incognito/private window
5. Try a different browser

### ❌ Page loads but features don't work (WebSocket errors)

**Solution:**
1. Check if the WebSocket connection is failing in browser console (F12 → Console)
2. Ensure port `8443` is open on the firewall
3. Try refreshing the page
4. Check that the frontend is not pinned to localhost for WebSockets (recommended: leave `VITE_WS_URL` empty so it auto-uses the current host):
   ```bash
   docker compose exec frontend env | grep VITE_WS_URL
   ```

### ❌ "ERR_SSL_PROTOCOL_ERROR"

**Solution:**
1. Ensure you're using `https://` not `http://`
2. Verify the port is `:8443` not `:443` or `:8000`
3. Restart the nginx container: `docker compose restart nginx`

---

## Network Topology Examples

### Example 1: Home WiFi Network

```
┌─────────────────────────────┐
│      Home WiFi Network      │
│    (192.168.1.0/24)         │
├─────────────────────────────┤
│ • Server (192.168.1.100)    │
│ • Desktop (192.168.1.50)    │
│ • Laptop (192.168.1.51)     │
│ • Phone (192.168.1.52)      │
│ • Tablet (192.168.1.53)     │
└─────────────────────────────┘
```

All devices visit: `https://192.168.1.100:8443`

### Example 2: Office Network

```
┌──────────────────────────────┐
│   Office Network             │
│   (10.0.1.0/24)              │
├──────────────────────────────┤
│ • Server (10.0.1.200)        │
│ • Dev Laptop (10.0.1.105)    │
│ • QA Phone (10.0.1.110)      │
│ • Demo Tablet (10.0.1.115)   │
└──────────────────────────────┘
```

All devices visit: `https://10.0.1.200:8443`

---

## Performance Tips

### For Smoother Gaming Experience:

1. **Wired Connection (if possible):** Plug server/device into Ethernet for lowest latency
2. **5GHz WiFi:** Use 5GHz band instead of 2.4GHz for faster speeds
3. **Close other apps:** Stop bandwidth-heavy apps (downloads, streaming)
4. **Reduce distance:** Stay closer to the WiFi router
5. **Minimize latency:** Check RTT indicator in the game HUD

### Monitor Connection Quality:

- Open browser console: **F12** → **Console** tab
- Look for messages like `RTT Xms` to see your network latency
- Latency < 50ms is ideal for gaming

---

## Security Notes

⚠️ **Important for Production:**

The self-signed SSL certificate is fine for **local development only**.

For **public/production deployment:**
1. Obtain a valid SSL certificate (Let's Encrypt, etc.)
2. Configure proper domain names
3. Set up firewall rules
4. Use VPN for remote access instead of exposing ports
5. Change all default passwords

⚠️ **Local Network:**

- Traffic on your local network is **not encrypted** by default
- Only use for trusted networks
- Don't connect from untrusted WiFi networks

---

## Quick Cheat Sheet

| Device Type | Browser | URL Format |
|------------|---------|-----------|
| iPhone | Safari | `https://192.168.1.100:8443` |
| Android | Chrome | `https://192.168.1.100:8443` |
| Windows | Any | `https://192.168.1.100:8443` |
| macOS | Safari/Chrome | `https://192.168.1.100:8443` |
| Linux | Firefox/Chromium | `https://192.168.1.100:8443` |

**Always replace `192.168.1.100` with your actual server IP address!**

---

## Getting Help

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review backend logs: `docker compose logs backend --tail 50`
3. Review nginx logs: `docker compose logs nginx --tail 50`
4. Test connectivity: `ping YOUR_SERVER_IP`
5. Check open ports: `netstat -an | grep 8443` (Linux/macOS)

---

## Related Documentation

- [README.md](../README.md) - Main project documentation
- [Docker Setup](../docker-compose.yml) - Container configuration
- [BACKEND_SETUP.md](./BACKEND_SETUP.md) - Backend-specific setup (if exists)

---

**Last Updated:** April 2026  
**Version:** 1.0
