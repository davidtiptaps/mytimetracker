# Time Tracker

Track and plan hours on your projects (like **Casita Work → Kitchen**), with
hourly rates, budgets, a calendar and PDF/CSV reports.

It's a web app you install on your iPhone's home screen. Everything is saved
on the phone, so it works anywhere, even with no signal. When your laptop is
on and running the small server in this folder, the phone syncs with it, and
the laptop keeps a backup of everything.

```
iPhone (the app, with its own copy of your data)
   │  syncs over Tailscale when the laptop is on
   ▼
Laptop: start-server.bat  →  data\timetracker.db
```

---

## Setting it up (Windows laptop + iPhone)

You only do this once. Set aside about 30 minutes. You don't need to know
anything about programming: it's installing a few programs, copying one line,
and double-clicking a file.

**Before you start:** make a free account at https://github.com and send Andrew
your username. He'll invite you to this project. Open the invite email and
click **Accept invitation**.

### Step 1: Install three programs on the laptop

Download each one, open the installer, and click **Next** until it finishes.

1. **Node.js**: https://nodejs.org. Click the big **LTS** download button.
   Near the end there's a box about "tools for native modules". **Leave it
   unticked.**
2. **Git**: https://git-scm.com/download/win. Click **Click here to download**.
   The installer asks a lot of questions. The answers it already picked are
   fine, so keep clicking **Next**.
3. **Tailscale**: https://tailscale.com/download/windows. After installing,
   it asks you to sign in. Use your Google, Microsoft or Apple account, and
   remember which one. You'll use the same one on your iPhone.

### Step 2: Copy the app onto the laptop

1. Press the **Windows key**, type `cmd`, and press **Enter**. A black window
   opens.
2. Copy this line, paste it into the black window (**Ctrl + V**), and press
   **Enter**:

   ```
   cd %USERPROFILE% && git clone https://github.com/AMcPherran/david-time-tracker.git
   ```

3. If a GitHub sign-in window pops up, sign in with your GitHub account.
4. When it's done, close the black window. There's now a folder called
   **david-time-tracker** in your user folder (open File Explorer and look
   under **This PC → Local Disk (C:) → Users → your name**).

> Tip: right-click the folder and choose **Pin to Quick access** so it's easy to find later.

### Step 3: Turn on secure addresses in Tailscale

iPhones only install web apps from secure (`https://`) addresses. Tailscale
makes one for free, but you have to switch it on once.

1. Go to https://login.tailscale.com/admin/dns and sign in.
2. Scroll down to **HTTPS Certificates** and click **Enable HTTPS**.
   (If it already says enabled, you're done.)

### Step 4: Start the server

1. Open the **david-time-tracker** folder.
2. Double-click **start-server.bat**. (It may show up as just
   **start-server** with a gear icon.)
3. A black window opens. The first time, it spends a minute or two setting
   things up. Lots of text scrolls by; that's normal.
4. If the window shows a link and says to visit it to enable serve, hold
   **Ctrl** and click the link, approve it in the browser, and wait.
5. When it's ready, it looks like this:

   ```
     Time Tracker server is running

     iPhone address:  https://davids-laptop.tail1234.ts.net
     Sync passcode:   1a2b3c4d
   ```

6. Write down the **iPhone address** and the **sync passcode**. You'll need
   both in the next step.

**Leave this black window open.** Closing it stops the server. You can
minimize it.

If Windows asks whether to allow Node.js on the network, click **Cancel**. It
doesn't need it.

### Step 5: Put the app on your iPhone

1. Install **Tailscale** from the App Store. Sign in with the **same account**
   as on the laptop. Allow it to add a VPN configuration, and make sure the
   switch in the Tailscale app is **on**.
2. Open **Safari** (it must be Safari, not Chrome) and type in the **iPhone
   address** from step 4.
3. When the app appears, tap the **Share** button (the square with an arrow)
   → scroll down → **Add to Home Screen** → **Add**.
4. Open **Time** from your home screen.
5. Tap **Settings** at the bottom → **Passcode** → type the **sync passcode**
   → tap **Save**. The status should turn green and say **Connected**.

That's it! From now on, always open the app from the home screen icon.

---

## Everyday use

- **The app works on its own.** Track time anywhere, even with no signal.
  Everything is saved on the phone.
- **Syncing** happens whenever the laptop's black window is open and the
  phone has internet with Tailscale on. It saves a copy of everything on
  the laptop. You don't have to do anything; the line under each screen's
  title says when it last synced.
- **To sync**, double-click **start-server.bat** on the laptop and wait a
  minute. It's fine to only do this now and then.

**Optional: start it automatically when the laptop turns on.**
1. Right-click **start-server.bat** → **Show more options** → **Create shortcut**.
2. Press **Windows key + R**, type `shell:startup`, press **Enter**. A folder opens.
3. Drag the new shortcut into that folder.

## Getting a new version

When Andrew tells you there's an update:

1. Close the black server window.
2. Double-click **update-app.bat** and wait for it to say "Updated".
3. Double-click **start-server.bat** again.

Next time you open the app on the iPhone (with the laptop's window open), it
updates itself. Your tracked time is not affected.

## Keeping a backup

Everything synced is stored in the **data** folder inside
**david-time-tracker**. Every month or so, copy that folder somewhere safe,
such as OneDrive or a USB stick.

You can also save a backup file from the phone: **Settings → Export Backup**.

## If something isn't working

| What you see | What to do |
| --- | --- |
| The app says **Laptop offline** | Is the black window open on the laptop? Is Tailscale switched on, on both the phone and the laptop? |
| The app says **Wrong sync passcode** | Open the **data** folder, open **config.json** with Notepad, and type the passcode shown there into the app. |
| The black window closes right away, or says **Node.js is too old** | Install Node.js again from https://nodejs.org (the LTS button). |
| The black window says **port 8787 is already in use** | The server is already running in another black window. Use that one. |
| The black window says **iPhone address: not available** | Open Tailscale on the laptop (in the bottom-right corner, by the clock) and make sure it's signed in and connected. |
| Safari says it **can't open the page** | Open the Tailscale app on the iPhone and make sure it's connected, and check the black window is open on the laptop. |
| There's no **Add to Home Screen** | Use Safari, not Chrome. |
| Anything else | Take a photo of the black window and send it to Andrew. |

---

## For developers

```sh
npm install
npm run dev      # app on http://localhost:5173, sync server on 127.0.0.1:8787
npm test         # unit tests (vitest)
npm run build    # type-check and build the app into dist/
npm start        # run the server, which also serves dist/
```

`npm run dev` prints the dev server's passcode. Enter it under Settings to test
sync. On macOS/Linux, `./start-server.sh` does the same as `start-server.bat`.

Server options (environment variables): `TRACKER_PORT` (default 8787),
`TRACKER_HOST` (default 127.0.0.1; use 0.0.0.0 to allow other devices on the
network), `DATA_DIR` (default `./data`), `SYNC_PASSCODE`.

### How it's built

- **App:** React + TypeScript + Vite, installable as a PWA (vite-plugin-pwa).
  Data lives in IndexedDB on the device (Dexie). The calendar is FullCalendar
  and PDFs are made on the phone with jsPDF.
- **Server:** `server/server.mjs`, plain Node with no npm packages, using Node's
  built-in SQLite. It serves the built app and one sync endpoint.
- **Sync:** every record has an id, an `updatedAt` time and a `deleted` flag.
  Each device pushes what it changed and pulls what's new since its last sync.
  When two devices edit the same record, the most recent edit wins. Deletions
  are kept as markers so they reach every device.
