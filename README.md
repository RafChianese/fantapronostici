# Fanta Pronostici — Full‑Stack Monorepo

Monorepo:
- `apps/web` → React + Vite + Tailwind
- `apps/api` → Node.js + Express + Prisma + Cron (node-cron)
- DB → Postgres (consigliato: Supabase FREE in deploy; in locale: Postgres via Docker Compose)

## Requisiti
- Node.js **20 LTS** (consigliato)
- Docker (solo per il Postgres locale) — **opzionale** se usi direttamente Supabase anche in locale

## Flusso leghe (nuovo)
1. Un utente può **registrarsi** da `/register`.
2. Dopo il login, se non appartiene ad alcuna lega approvata viene portato su `/onboarding`.
3. Da `/onboarding` può:
   - **Creare una lega** → diventa automaticamente **Admin della lega** (può gestire membri, regole, lock, risultati).
   - **Entrare in una lega** inserendo il **codice** → viene creata una richiesta **PENDING** da approvare dall’Admin della lega.
4. La **Classifica** e i **pronostici** sono sempre **per‑lega** (multi‑tenant).

## Pagina "Regolamento" (per‑lega)

Nel frontend è disponibile la pagina **Regolamento** (route: `/regolamento`).

- È accessibile dal menu di navigazione.
- Mostra un testo di regolamento **generato automaticamente** in base alle regole/setting configurati dall'admin della lega attiva.
- I dati arrivano dall'endpoint read‑only: `GET /api/regolamento-config` (scoped per‑lega tramite header `x-league-id` o query `leagueId/leagueCode`).

## Setup locale (100% funzionante)

### 1) Avvia Postgres locale (consigliato)
```bash
docker compose up -d
```

### 2) Configura env
Copia gli esempi:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 3) football-data.org (obbligatorio per avere partite)

Questo progetto usa **football-data.org API v4** per:
- scegliere una competizione (Serie A, Premier League, LaLiga, Bundesliga, Ligue 1, Champions League, World Cup, European Championships, ecc.)
- importare automaticamente le partite pronosticabili
- sincronizzare risultati reali e ricalcolare punteggi/classifica/badge

**A) Registrazione e API key**
1. Registra un account su football-data.org
2. Genera una API key (X-Auth-Token)
3. Inseriscila in `apps/api/.env`:

```env
FOOTBALL_DATA_API_KEY=YOUR_KEY
```

Documentazione ufficiale: football-data.org v4.

### 4) Database + seed (da root)

```bash
npm install
npx prisma db push
npx prisma db seed
npm run dev
```

> Nota: il seed crea utenti/leghe/regole ma **non inserisce partite**. Le partite arrivano dall'import via SuperAdmin.

### Workflow SuperAdmin
1. Login come SuperAdmin (`superadmin@example.com` / `Admin123!`)
2. Vai su `/super`
3. Sezione **football-data.org**: cerca e seleziona competizione (+ stagione opzionale)
4. Clicca **Importa partite**
5. Sezione **Calcola giornata**: sincronizza risultati (anche filtrando per matchday)

## Servizi esterni e API Key (guida completa)

Il progetto integra alcuni servizi esterni opzionali. Senza API key l'app **parte comunque** (seed + inserimento manuale), ma alcune feature non saranno disponibili.

### 1) Email reset password — SendGrid (consigliato, senza dominio)

Usato da: `POST /api/auth/forgot-password`.

**A) Registrazione**
1. Crea un account SendGrid.

**B) Verifica mittente senza dominio (Single Sender Verification)**
1. Dashboard SendGrid → **Settings → Sender Authentication**
2. Seleziona **Single Sender Verification**
3. Inserisci un mittente reale (es. la tua Gmail) e completa la verifica cliccando il link ricevuto via email.

**C) Genera API Key**
1. Dashboard SendGrid → **Settings → API Keys**
2. **Create API Key**
3. Permessi minimi: **Mail Send**
4. Copia la chiave (formato `SG...`).

**D) Configura env backend** (`apps/api/.env`)
```env
SENDGRID_API_KEY=SG_xxx
EMAIL_FROM=la_tua_email_verificata@example.com
# opzionale
EMAIL_REPLY_TO=la_tua_email@example.com
```

**E) Test rapido**
1. Avvia l'API.
2. Usa la schermata "Password dimenticata".
3. In SendGrid controlla **Email Activity** per vedere Delivered/Dropped/Bounced.

---

### 2) Pubblicità Reward (solo Web) — Google Ad Manager (GPT)

Usato da: modale "Vedi pronostici" (reward ads).

**A) Prerequisiti**
1. Crea un account **Google Ad Manager**.
2. Collega/approva l'account AdSense quando richiesto (serve per abilitare monetizzazione e pagamenti).

**B) Crea l'inventory**
1. In GAM crea una **Ad Unit** per lo slot reward, es.:
   - `/1234567/fanta-pronostici/web_rewarded`
2. Crea un **Line Item** (anche "House" per test) e assegna una creatività.

**C) Configura env frontend** (`apps/web/.env`)
```env
VITE_GAM_AD_UNIT=/1234567/fanta-pronostici/web_rewarded
VITE_GAM_SIZE=300x250
```

**D) Toggle da SuperAdmin**
Vai su `/super` e imposta:
- `adsEnabled = true`
- `demoAdsEnabled = false`
- `rewardUnlockMinutes = X` (durata sblocco)

> Nota: GPT è per il **Web**. Per app native/Capacitor la monetizzazione va fatta con **AdMob** (SDK mobile).

### 2b) Pubblicità Reward (Mobile/Capacitor) — AdMob (plugin Capacitor)

Nel mobile (APK/IPA) la modale "Vedi pronostici" usa automaticamente un rewarded AdMob **se** l'app gira su Capacitor.

**A) Prerequisiti AdMob**
1. Crea un account **Google AdMob**.
2. Crea una **App** (Android/iOS) in AdMob.
3. Crea un **Rewarded Ad Unit** per Android e/o iOS.

**B) Configura il progetto Capacitor**
1. Aggiungi Capacitor al progetto web (se non l'hai già fatto) e crea la shell nativa:
```bash
npx cap init
npx cap add android
# opzionale
npx cap add ios
```
### Nota su dominio / AdSense
Per la monetizzazione **mobile** non serve Google AdSense né un dominio: qui usiamo **Google AdMob** dentro un'app nativa (Android/iOS) costruita con **Capacitor**.

Quello che ti serve creare è:
1) Un account **Google AdMob**
2) Una "App" AdMob (Android e/o iOS)
3) Una **Rewarded Ad Unit**

Poi inserisci gli ID come indicato sotto.

2. Installa il plugin AdMob:
```bash
npm i @capacitor-community/admob@6
npx cap update
```

**C) Config Android**
Nel file `android/app/src/main/AndroidManifest.xml` aggiungi sotto `<application>`:
```xml
<meta-data
  android:name="com.google.android.gms.ads.APPLICATION_ID"
  android:value="@string/admob_app_id" />
```
e in `android/app/src/main/res/values/strings.xml`:
```xml
<string name="admob_app_id">[ADMob_APP_ID]</string>
```

**D) Config iOS**
In `ios/App/App/info.plist` aggiungi:
```xml
<key>GADIsAdManagerApp</key>
<true/>
<key>GADApplicationIdentifier</key>
<string>[ADMob_APP_ID]</string>
```

**E) Env frontend (Rewarded Ad Unit ID)**
In `apps/web/.env` aggiungi:
```env
VITE_ADMOB_REWARDED_UNIT_ID=ca-app-pub-xxxxxxxxxxxxxxxx/xxxxxxxxxx
```
Per test usa gli **ID di test** AdMob (consigliato) prima di andare in produzione.

Riferimento plugin: `@capacitor-community/admob` README su GitHub.

---

### 3) Sync risultati da provider esterno — football-data.org (opzionale)

Il backend può sincronizzare periodicamente (cron) i risultati della competizione selezionata dal SuperAdmin.

**A) Registrazione**
1. Registrati su football-data.org e ottieni una API key.

**B) Configura env backend** (`apps/api/.env`)
```env
FOOTBALL_DATA_API_KEY=xxx
SYNC_EVERY_MINUTES=5
```

> Se usi il Postgres locale via Docker, non serve cambiare `DATABASE_URL` (è già pronto).
> Se invece usi Supabase anche in locale, sostituisci `DATABASE_URL` in `apps/api/.env`.

### 3) Installa dipendenze (monorepo)
```bash
npm install
```

### 4) Migrazioni + seed
```bash
npm run db:migrate
npm run db:seed
```

### 5) Avvio dev (web + api)
```bash
npm run dev
```

Apri:
- Web: http://localhost:5173
- API: http://localhost:5000/health

## Credenziali demo
- **SuperAdmin (gestione leghe)**: `superadmin@example.com` / `Admin123!`  → UI: `/super`
- **Admin della lega demo**: `admin@example.com` / `Admin123!` → Lega: `DEMO` → UI Admin lega: `/admin`
- Utenti demo (membri della lega `DEMO`):
  - `mario@example.com` / `Demo123!`
  - `luisa@example.com` / `Demo123!`
  - `giulia@example.com` / `Demo123!`
  - `paolo@example.com` / `Demo123!`
  - `sara@example.com` / `Demo123!`

## Aree e URL
- Area comune (per lega, utenti loggati): `/leaderboard` (classifica + link ai dettagli)
- Area partecipante (login obbligatorio): `/` (lista match + pronostici + countdown)
- Area admin (login separato): `/admin` (dashboard)

## Logica punteggi
Per ogni match e utente (quando il match è FINISHED e ha risultato):
- RISULTATO ESATTO: golCasa==realeCasa e golTrasferta==realeTrasferta
- PRONOSTICO 1X2: segno uguale (casa/pareggio/trasferta)
- SOMMA GOL: (golCasa+golTrasferta) == (realeCasa+realeTrasferta)

Punti configurabili dall’admin in tempo reale (ricalcolo immediato).

## Lock pronostici
Admin imposta:
- `lockUntil` (data/ora di fine modifiche)
- `force lock` (bottone per blocco immediato)

Comportamento:
- se bloccato → endpoint `PUT /api/me/predictions` risponde 403
- UI mostra “Pronostici bloccati” e countdown a zero

## Dati partite e risultati (import + sync)
- Il seed crea utenti/leghe/regole, ma **non inserisce partite**.
- Le partite arrivano dal workflow SuperAdmin: seleziona competizione → importa partite.
- Sync opzionale: il backend può sincronizzare periodicamente (cron) risultati della competizione selezionata dal SuperAdmin (richiede `FOOTBALL_DATA_API_KEY`).
- Fallback emergenza: l'admin può impostare manualmente risultato e stato match solo per partite non importate da provider esterno.

## Script principali
- `npm run dev` → avvio sviluppo (web + api)
- `npm run start` → build + start (servizio API serve anche la build web)
- `npm run db:migrate` → `prisma migrate deploy` + generate
- `npm run db:seed` → seed utenti + match demo
- `npm run db:studio` → Prisma Studio

## Deploy gratuito (0€)

### Database: Supabase FREE
1. Crea un progetto su Supabase
2. Vai su **Project Settings → Database** e copia la **Connection string** (Postgres)
3. Imposta `DATABASE_URL` nel backend (Render) con quella stringa

### Backend: Render (Hobby/free)
1. Crea un nuovo **Web Service** collegando il repo Git (monorepo)
2. Root directory: repository root
3. Build command:
   ```bash
   npm install && npm --workspace apps/api run build
   ```
4. Start command:
   ```bash
   npm --workspace apps/api run start
   ```
5. Env vars da impostare su Render:
   - `NODE_ENV=production`
   - `PORT=5000` (Render di solito imposta `PORT` automaticamente: usa quello)
   - `WEB_ORIGIN=https://<tuo-vercel-app>.vercel.app`
   - `JWT_SECRET=...`
   - `JWT_EXPIRES_IN=7d`
   - `DATABASE_URL=...` (Supabase)
   - (opzionale) `FOOTBALL_DATA_API_KEY=...`
   - `SYNC_EVERY_MINUTES=5`

### Frontend: Vercel (Hobby)
1. Importa il repo su Vercel
2. Project settings:
   - Framework preset: **Vite**
   - Root directory: `apps/web`
   - Build command: `npm run build`
   - Output directory: `dist`
3. Env vars su Vercel:
   - `VITE_API_URL=https://<tuo-render-api>.onrender.com`

### Note deploy
- Render free può andare “sleep” dopo inattività: la prima chiamata può essere più lenta.
- In produzione puoi lasciare attivo il fallback manuale per i risultati, così l’app è usabile anche se il provider esterno non è disponibile.

## Import partite e risultati (football-data.org)

Le partite **non** vengono più inserite dal seed: arrivano solo dal workflow SuperAdmin (sezione **football-data.org** su `/super`).

### Configurazione
1. Registrati su football-data.org e genera una API key
2. Metti la key in `apps/api/.env` come `FOOTBALL_DATA_API_KEY`

Se la key manca o il provider risponde con errori/rate limit, il backend logga un messaggio chiaro e l'app non va in crash.

