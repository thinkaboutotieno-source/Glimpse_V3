# Glimpse

An infinite, zoomable wall where people post photos, videos of up to 30 seconds, quotes and thoughts.

## Put it online

**See [DEPLOY.md](DEPLOY.md)**: a step-by-step guide to running Glimpse on Render with the included `render.yaml`
(persistent disk, generated admin password, health check). Once your code is on GitHub, you can also use this button
(replace `YOUR-USERNAME`):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/YOUR-USERNAME/glimpse)

## Run it

You need Node.js 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000. Everyone who opens that address sees the same wall.

Install **ffmpeg** too if you can (`brew install ffmpeg`, `sudo apt install ffmpeg`, or from ffmpeg.org).
The browser already refuses videos over 30 seconds, but with ffmpeg the server checks the real length
of every upload as well, so nobody can get around the limit.

## Android

Glimpse can be installed on Android two ways: as an installable website (open it in Chrome → **Install app**),
or as a real app built from `android-app/` and published on Google Play. **See [ANDROID.md](ANDROID.md)** for
step-by-step instructions, including how to host the server.

## Tests

```bash
npm test
```

Runs 32 automated checks against a real server (started on a spare port with throwaway folders, so your posts are
never touched): posting rules, private data never leaking, video clips and voice-note limits, sealed time capsules,
likes and reactions, deleting, reports and auto-hiding, admin keep/ban, replies, private walls, share-page previews,
the live stream, the Android app's access, friends (requests, invite links, and friends-only posts staying private), places from time zones, The Void, channels and #hashtags, portals, supernovas, comets and their replies, translation, handwriting, remixes, night posts, graffiti hour and murals, and badges. It takes a few seconds and needs nothing extra installed.
Run it after every change, before you deploy.

## Project layout

```
server.js          Express server: API, uploads, JSON storage
render.yaml        Render Blueprint (how to run it online; see DEPLOY.md)
test/api.test.js   Automated tests (npm test)
public/index.html  Page structure
public/style.css   Styles
public/script.js   Wall, zoom, uploads, viewer
public/config.js   Server address (empty for the website; set by the Android build)
public/vendor/qrcode.js   QR code generator (MIT licence, by Kazuhiko Arase)
data/walls.json    Private walls (created on first use)
data/users.json    Friend codes, names and friend lists (created on first use)
data/void.json     Deleted posts waiting in The Void (erased after 30 days)
data/comets.json   Comets in flight (deleted after 7 days)
public/vendor/geo.js  World map and city coordinates for the globe and sky view (public domain)
public/sw.js       Makes the website installable and quick to reopen
public/manifest.webmanifest, public/icons/   App name, colours and icons
android-app/       The Android app (Capacitor); see ANDROID.md
data/posts.json    Created on first run; all posts live here
uploads/           Created on first run; uploaded files live here
```

## How uploads work

- **Photos** are resized in the browser to 1800px on the long edge before upload, plus a 520px thumbnail for the wall.
- **Videos** are checked in the browser for length (30 s) and size (60 MB). A thumbnail is captured from the first second.
  The server checks type, size and length again.
- **Quotes** are up to 280 characters with four card styles.
- **Thoughts** are personal notes of up to 500 characters (line breaks allowed) in four note colours.
  Others react with ❤️ 🤗 😂 😮 😢 🙌, one reaction per person per thought; tapping it again removes it.
  Change the set in `REACTIONS` in `public/script.js` and the matching list in `server.js`.

Each new post returns a private delete token that is saved in the poster's browser, so only they can delete it.
To delete anything as the site owner, start the server with `ADMIN_TOKEN=some-long-secret npm start` and send that
value in the `X-Delete-Token` header:

```bash
curl -X DELETE -H "X-Delete-Token: some-long-secret" http://localhost:3000/api/posts/POST_ID
```

## Themes

The theme button in the top bar offers thirteen themes: **Light**, **Dark**, **Gallery**, **Universe**, **Amazon**, **Deep Ocean**, **Aurora**, **Sakura Dusk**, **Neon City**, **Sahara Night**, **Noir**, **Neo Tokyo** and **Warp Drive**. Every theme change plays a short time-travel transition (a clock vortex and a flash). Gallery hangs every post on a
museum-green wall under soft spotlights: photos get gilded frames with a cream mat, videos get slim black
frames, quotes are framed like prints in oak, and each piece has a museum wall label (artist, title, year, medium).
All gallery styles are in the `GALLERY THEME` section at the end of `public/style.css`. Change `--bg` there
to repaint the wall (for example `#6b2430` for oxblood, or `#f2efe9` for a white-cube gallery).

## Time travel and timestamps

Every post shows when it was added ("3h ago" on the cards, the full date in the viewer and on gallery labels;
Neo Tokyo shows exact futuristic timestamps like `2026.10.07 14:32`).

The **Time travel** control in the Discover panel filters by age and changes era:

- **Past** → posts older than the cutoff, in **Noir** (black and white, rain, a street lamp, film grain). The year counter rolls back to 1947.
- **New** → the newest posts, in **Neo Tokyo** (neon kanji towers, holographic koi, a bullet train). The counter rolls forward to 2087.
- **Now** → all posts, in a random theme (never Noir or Neo Tokyo, and never the one you're already in).

The cutoff is 24 hours ago, unless that would leave one side (nearly) empty; then it's the midpoint of the
posts you're looking at. Plain-language searches work too: "old photos", "latest thoughts", "new videos about
football" set the time, the type and the search words.

## Time capsules

Turn on **Seal as a time capsule** when posting (any type) and pick when it opens: in a week, a month, a year,
at New Year, a custom date, or "in a minute" to try it out. Until then:

- The wall shows a glowing capsule with a live countdown, and the timeline marks it in gold.
- The server never sends a sealed post's contents to anyone, including the person who posted it. Likes and
  reactions are blocked too. Capsules can stay sealed for up to 10 years (`MAX_CAPSULE_YEARS` in `server.js`).
- When the moment arrives, everyone who has the site open sees it burst open with gold and violet fireworks.

## Timeline

The slider at the bottom travels back through the wall's history. Drag left and posts newer than that moment
fade away, a big date appears, and the whole scene ages into sepia the further back you go. Release to glide to
the nearest post from then. Tick marks show when each post was added. "Now" (or "Show all") snaps it back.

## Sound

The speaker button in the top bar turns on ambient sound (off by default; the choice is remembered). Every
theme has its own soundscape, generated live with the Web Audio API, so there are no audio files: rain and a
lonely horn in Noir, crickets and frogs in Amazon, waves, bubbles and whales in Deep Ocean, koto plucks and wind
chimes in Sakura Dusk, a synth bassline in Neon City, a campfire in Sahara Night, and more. The effects have
sounds too (firework booms, the black hole's rumble, the clock ticking up to a time jump, a capsule opening).
Each soundscape is in the `SCAPES` object in `public/script.js`.

## Effects

- **Opening the site:** the wall bursts into view as a firework.
- **Discover filters** each play an effect before landing on a matching post:
  All, Photos and Thoughts → **fireworks**, Quotes → **wormhole**, Videos → **black hole**,
  Voice → **sound wave** (pulsing rings and an equaliser; the wall bounces as each wave passes)
  (which also pulls the panels in and shakes the screen).
- Press **Escape** to skip an effect. People who've turned on "reduce motion" in their device settings don't see them.
- To change which filter plays which effect, edit `FILTER_FX` in `public/script.js`. Effect timings and
  colours are in the `EFFECTS` object in the same file.

The **Universe** theme draws a live space background (Milky Way, nebulae, spiral galaxies, twinkling stars).
Zooming the wall flies you through the stars, and fast moves stretch them into warp streaks. Its code is
the `Space` object in `public/script.js`.

The **Amazon** theme is a rainforest at night: layered jungle silhouettes with mist and moonbeams, fireflies
that flash and swerve away from the cursor (zoom to fly through the swarm), glowing poison dart frogs that
blink, croak and hop between branches, and swaying leaves in the corners with frogs sitting on them.
Its code is the `Jungle` object in `public/script.js`. On slow devices it automatically uses fewer fireflies.

The five newest animated themes are built with a small scene kit (`makeScene` in `public/script.js`):

- **Deep Ocean**: glowing jellyfish, plankton that sparkles where the cursor passes or when the wall moves, swaying kelp, light shafts.
- **Aurora**: rippling northern lights over snowy mountains and pine forest, snowfall (nearest flakes over the posts), shooting stars.
- **Sakura Dusk**: sunset over a snow-capped volcano and a pagoda, floating sky lanterns, cherry branches swaying in the corners, tumbling petals.
- **Neon City**: synthwave grid that rushes toward you when you zoom, striped sunset, glowing skyline, flying cars, rain.
- **Sahara Night**: dunes under stars wheeling around the pole star, a camel caravan, shooting stars, a campfire with rising embers.

**Deep Ocean's creatures of the deep:** an **anglerfish** prowls near the seabed with a jaw full of needle teeth and a
glowing lure (move your pointer near and it drifts toward you, its lure pulsing brighter; tap and it snaps, swallowing
any lanternfish that strayed too close). Also: a **school of lanternfish** with glowing bellies that scatters from your
pointer, a **vampire squid** that turns its cloak inside out and puffs glowing blue sparks when tapped, a flapping
**dumbo octopus**, a **comb jelly** rippling with rainbow light, a **siphonophore** drifting like a string of fairy
lights, a **gulper eel** with an enormous mouth and a glowing red tail tip, and little **hatchetfish**.

**Neo Tokyo's neon dragons:** four long, serpentine Eastern-style dragons (original designs) fly through the
Neo Tokyo sky, one for each element, weaving between the towers. Each chases a glowing pearl of its element, marked
with its kanji:
**🔥 Fire (火)**, red-orange, trailing rising embers with flame-tipped fins;
**💧 Water (水)**, electric blue, trailing droplets and bubbles;
**🌿 Earth (土)**, jade and gold, shedding glinting crystal shards; and
**🌪 Wind (風)**, violet-white, wrapped in curling gusts.
Each has antler horns, flowing whiskers, a mane, scales and clawed legs. Tap near one and it turns and breathes its
element at your finger, with a roar to match (crackling fire, a rushing splash, a rumbling quake, a howling gust).
Now and then you'll hear one call far away.

**Warp Drive** puts you in a starship cockpit at warp speed: a window frame with glowing dashboard lights and a
live speed readout, stars streaming past, a nebula turning in the distance, planets sweeping by, and every so often a
rainbow wormhole passage. Zooming pushes the throttle (the streaks stretch), dragging steers, and tapping "punches
it" past light speed. Its sound is a humming engine with cockpit beeps and a whoosh through each wormhole.

Each wormhole is a journey: an **acceleration burst** at the mouth (the speed spikes, a shockwave, the cockpit shakes
and the display flashes "ACCELERATION BURST ▲▲▲"), the tunnel, then a flash as you burst out over an **alien city**:
a huge ringed planet and moons in the sky, a blazing sun with lens flare, skyscrapers and domes running to the
horizon, traffic along the waterfront, piers into a glittering bay, and ships flying overhead. Tap there to launch a
ship. After about 25 seconds the engines spool up and the city streaks away into warp. Destinations rotate between
Aster Harbor (blue day), Kepler Dusk (golden dusk) and Nova Meridian (teal alien world); add more to `DESTINATIONS`
in `public/script.js`.

**The cockpit console** (Warp Drive only) has five glowing buttons on the dashboard:

- **Universe**, **Andromeda** and **Aurora** jump the ship there through hyperspace ("DESTINATION: ANDROMEDA").
  A **🚀 Back to the ship** button then brings you home. Picking a theme from the menu leaves the ship as usual,
  and the other themes stay exactly as they are.
- **Andromeda** is a theme you can only reach from the cockpit: our neighbouring spiral galaxy tilted across the sky,
  with its golden core, blue arms, dust lanes and two little companion galaxies, slowly turning; zoom to draw closer,
  tap to set off a star birth.
- **✦ Constellations** opens a star chart: each part of the world is a constellation with a shimmering star (with the
  number of posts from there), and every city people have posted from is a smaller star in it. Tap one to fly there
  through hyperspace and see only its posts. Places come from the city of each poster's time zone (never GPS), and
  people can untick "Show where it's from" when posting.
- **🕳 The Void** opens the recycle bin (also in Discover → *The Void*, in every theme).

## Channels, portals and the wider world

All of these live in Discover's **Explore** row (and some on the Warp Drive cockpit).

- **🪐 Channels.** Public, listed walls anyone can find and post in: #music, #football, #food, #travel, #art, #study
  and #tech to start, and anyone can create more. The Channels panel shows them as a **solar system**: the busiest
  one burns at the centre like a sun, and planets grow with activity. Tap one to fly there through hyperspace.
  Putting a channel's name in a public post (*"new album on repeat #music"*) also drops it into that channel.
- **🌀 Portals.** Hosts can link two walls (the wedding in Nairobi and the family in London): one host shows their
  **portal key** in the Share panel, the other pastes the wall link and key. Posts then flow both ways, live, with a
  swirling 🌀 badge.
- **🌟 Supernovas.** When a post gets `SUPERNOVA_AT` likes and reactions (default 25) within an hour, it explodes on
  everyone's screen at once: rings of light, sparks, the wall shoved outward. It keeps a golden pulsing aura for a
  day. The admin can also make any post a supernova.
- **🌀 Gravity** (a toggle). The most-loved posts become glowing suns, and nearby posts slowly orbit them. Replies
  circle their thought as little moons.
- **💥 Big Bang.** The ▶ on the timeline (or the chip) replays the wall's history: a flash, the universe expanding,
  and every post flying out of a single point in the order it was posted while the date counts forward.
- **☄️ Comets** (messages in a bottle). Write something and launch it: it crashes onto one random stranger's screen
  somewhere in the world (now, or as soon as someone comes online). They tap the comet to catch it, and can reply,
  and the reply flies back the same way. Anonymous, reportable, deleted after a week.
- **🌍 The living Earth.** A spinning globe drawn from Natural Earth's public-domain map, lit where posts come from.
  Day and night are real, a **golden band shows where sunrise is arriving**, and *Watch the sunrise travel*
  fast-forwards a day. When someone posts live, a beam arcs from their city to yours. Tap a light to see that city's posts.
- **🔭 Sky view.** On a phone, tap *Use motion* and hold it up: each city's posts hang in the real compass direction
  of that city (further away = higher in the sky), with the distance. *Camera* shows them over the real world. On a
  computer, drag to look around.
- **🌐 Translate.** In the viewer: uses the browser's own on-device translator where available (Chrome), otherwise
  your translation server. Set `LIBRETRANSLATE_URL` (and `LIBRETRANSLATE_KEY` if it needs one) to a
  [LibreTranslate](https://libretranslate.com) server, which you can host yourself for free or use their paid API.
  Without either, the button says translation isn't set up.
- **🌧 Live weather** (theme menu, off by default). Fetches your city's real weather from Open-Meteo (free, no key) and
  draws it over any theme: rain, snow, fog, thunderstorms with lightning, and a night tint on the bright themes after
  dark. Discover shows "🌧 Rain · night · 14°C in Nairobi".

### The Void and the Devourer

Deleting your own post sends it to **The Void** instead of erasing it. First an original cosmic being, the
**Devourer** (a colossal living nebula with glowing constellation veins, a crown of pale eyes and a vortex maw ringed
with teeth of light), rises out of the dark, pulls the post in so it crumbles into golden dust, and clamps shut with
a flash. In The Void you can **Restore** a post (it bursts back onto the wall) or **Erase** it for good. Anything left
for 30 days is erased automatically, files included. Removals by wall hosts and the admin are permanent, as before.

### Adding another animated theme

1. Add CSS tokens for `:root[data-theme="yourtheme"]` at the end of `public/style.css` (copy the Amazon block).
2. Add a menu button with `data-theme-choice="yourtheme"` in `public/index.html`.
3. Add the name to `THEMES` in `public/script.js`.
4. For a live background, create it with `makeScene("yourtheme", { build() {…}, draw(t, dt) {…} })`
   (see the five examples) and add it to `SCENES`. Pass `front: true` to also draw over the posts on
   `this.fctx`, and `fringe: true` to place swaying corner decorations with `fringeItem()`.

## Live, social and creative features

- **Live updates.** Everyone on a wall is connected to a live stream (`/api/stream`). New posts fly onto everyone's
  screen within a second, likes, reactions and replies update live, and removed posts disappear. Other visitors show
  up as softly drifting lights, with "N here now" in the Discover panel. If the live stream can't connect, the site
  falls back to checking every 20 seconds.
- **Replies on thoughts.** Open a thought to read and write replies (up to 280 characters). Replies can be reported,
  and people can delete their own.
- **Voice notes.** A fifth post type: record up to 30 seconds in the browser (or upload an audio file). Cards show the
  waveform; the viewer has a tappable waveform player. The Android app asks for the microphone only when you tap record.
- **Long videos.** Videos longer than 30 seconds are no longer refused: a trimmer lets you choose which 30 seconds (or
  less) to post. The whole file is uploaded (60 MB limit) and plays only the chosen clip.
- **Photo filters.** Original, Noir, Vintage, Neon, Aurora, Ocean, Sakura, Golden and Jungle; the one matching your
  current theme is marked ✨. Filters are applied in the browser before upload.

## Friends

- **Opening Friends** (the 👥 button) plays a **hyperspace jump**: the engines charge, the stars stretch into
  light-speed streaks, you fall through a rainbow wormhole while the cockpit counts past the speed of light, then
  a flash and the Friends panel.
- **Your friend card:** set your name, and share your **friend code** (e.g. `K7MP2Q`), your **invite link** or its
  **QR code**. Opening an invite link offers to add the person straight away; "Make a new link" retires the old one.
- **Requests:** add someone by their code; they see a red badge on the 👥 button (live, if they're online) and can
  accept or decline.
- **Friends-only posts:** when posting, choose *Who can see this? → 👥 Friends only*. The server only ever sends those
  posts (and their likes, reactions and replies) to the poster and their friends: never in public lists, share
  previews or anyone else's live stream. They carry a 👥 badge on the wall.
- **Filters:** in the Friends panel, *Show only my friends' posts*, or *Their posts* next to a friend.
- **No accounts:** friends are tied to the browser/app's anonymous device key. Clearing site data or switching
  devices gives a new friend code. (Real accounts would be the next step if people ask for it.)
- Friends-only posts aren't available on private walls (everything on a wall is for everyone on it).

## Sharing and private walls

- **Share links.** Every post has a Share button. Links look like `https://your-site/p/<id>` and show a proper
  preview (title, text and a 1200×630 image drawn at upload time) on WhatsApp, X, Facebook, Slack and so on.
  Opening one glides straight to the post. Sealed time capsules only ever preview as a capsule.
- **Private walls.** Under the logo, open the wall menu → **Create a private wall** (for a wedding, class, trip…).
  It gets an unlisted link (`/w/<code>`) and a QR code you can download and print. Anyone with the link can view and
  post. The creator's device becomes the **host** and can remove any post or reply on that wall. Reports from private
  walls still reach your admin page. Wall links can be opened in the Android app via the wall menu → *Join with a link*.

## Little delights

- **Tap the world.** Tapping an empty spot makes a ripple, and the animated themes answer: a burst past light speed (Warp Drive), frogs croak and hop and
  fireflies scatter (Amazon), jellyfish jet away and the plankton lights up (Deep Ocean), a supernova (Universe),
  a gust of petals (Sakura), lightning and thunder (Noir), the koi swim to your finger or a dragon breathes its element at it (Neo Tokyo), and a shooting
  star (Aurora, Sahara).
- **On this day.** If someone posted a year, a month or a week ago today, a card offers to time-travel you there.
- **Today's question.** A daily question (the same for everyone, 60 in rotation) sits at the top of Discover.
  **Answer** opens a thought tagged with the question; **See answers** shows everyone's. Edit the list in `PROMPTS`
  in `public/script.js` (and `PROMPT_COUNT` in `server.js` if you change how many there are).
- **Calm mode.** In the theme menu: pauses every animation (backgrounds become still pictures, effects and
  transitions are skipped). People with "reduce motion" turned on in their device settings get this automatically.

## Your theme song

Theme menu → **Your theme song**. Pick any audio file from your device (MP3, M4A, OGG, WAV, FLAC…, up to 60 MB) and
it becomes your background music, looping softly:

- **For every theme**, and optionally a different song **just for one theme** (one for Sahara, another for Neo Tokyo).
  Switching themes crossfades between them.
- It replaces the theme's own soundscape while it plays (tick *Keep the theme's own sounds underneath* to mix them).
  Effects like fireworks and dragon roars still play over it. Volume slider, play/pause, and the 🔈 button turns it
  off with everything else.
- Songs are stored **only on that device** (in the browser's storage) and never uploaded: nobody else hears them,
  and nobody's music gets shared without permission.

## A secret in the Sahara (spoilers!)

In **Sahara Night**, click one of the camels walking in the caravan on the far dune (or just type **camel**).
Up pops **Camel Run**, a little pixel-art game in the spirit of Chrome's offline dinosaur: a camel running across
the dunes at night with a **flying saucer** chasing it.

- **Space / ↑ / tap** to jump cacti, rocks, cow skulls and bouncing tumbleweeds.
- **↓ / tap low on the screen** to kneel (camels really do!) under the saucer's lasers. It charges with a pink glow
  first, so watch for it.
- It speeds up as you go, flashes and chimes every 100 points, and saves your high score on the device.
- One hit and the saucer swoops in and **abducts your camel** with its tractor beam. Space or tap to run again,
  Esc (or the back button) to leave. On phones there are big ▲ Jump and ▼ Kneel buttons.

## Making things together

- **✍️ Handwritten thoughts.** In the Thought tab, tick *Write it by hand* and write or doodle with your finger or
  mouse (five ink colours, undo, clear). The handwriting itself becomes the note. An optional description is read
  aloud by screen readers.
- **🎤 Remixes.** Open any video or voice note and tap *Remix* to answer it with your own video or voice note. In
  the viewer they appear side by side and play together, like a duet.
- **🎨 Graffiti hour.** Once a day the wall becomes a shared canvas: everyone online sprays neon strokes together, live,
  on a brick wall. When the hour ends it freezes into a **mural** post signed "Everyone". Discover's *Graffiti* chip
  shows when it's live (or when it opens, in your time). Set the time with `GRAFFITI_HOUR_UTC` (default 18 UTC)
  and `GRAFFITI_MINUTES` (default 60).
- **🎬 The Story of the Day.** Discover → *Story* builds a 30-second vertical film (9:16) of the day's most-loved
  posts with gentle push-ins, warp transitions and a soundtrack made on the spot (no copyrighted music). *Make the
  video* records it in the browser (MP4 where the browser supports it, otherwise WebM) to download or share
  straight to WhatsApp, TikTok or Instagram. Nothing is uploaded.

## Feel

- **✨ Living cards** (theme menu): cards tilt toward the mouse with a moving shine; on phones the whole wall tilts
  gently as you move the phone.
- **🎧 Spatial sound** (theme menu): fly near a voice note or video and you start to hear it, louder as it grows
  closer, fading as you move on.
- **📳 Haptics** (theme menu, phones that allow it): little buzzes for fireworks, the black hole, dragon roars,
  the Devourer's bite, the camel's jump, supernovas and more. iPhones don't let websites vibrate.

## Night and day, occasions and badges

- **🌙 After dark only.** Tick it when posting and the post only appears between sunset and sunrise where each
  viewer is (worked out from their time zone's city and the real position of the sun). You always see your own.
- **🏅 Badges.** Fifteen quiet achievements, such as First glimpse, Comet catcher, Saw a supernova, Graffiti artist,
  Night owl, Storyteller and Found all 14 secrets. They show on your friend card (Friends panel), and friends see
  yours next to your name.
- **🎉 Seasonal decorations** (on by default, switch off in the theme menu): Halloween (bats, glowing pumpkins, posts
  drifting like ghosts, and the Devourer's eyes turn pumpkin-orange), December (fairy lights and snow), Diwali (a
  row of flickering diyas), Lunar New Year (red lanterns), Eid (a crescent moon and golden lanterns). Diwali, Lunar
  New Year and Eid dates are built in up to 2030; Eid can move a day with the moon sighting. Try one any time with
  `?season=halloween` (or `winter`, `diwali`, `lunar`, `eid`).
- **🎆 New Year.** A giant 10-second countdown at your own midnight, then fireworks and "Happy New Year". On the living
  Earth, *New Year wave* shows midnight rolling around the planet with fireworks along it ("It's midnight in
  Sydney"), and from New Year's Eve morning (UTC) to New Year's Day it shows the real thing. Test the countdown with
  `?newyear=15` (midnight in 15 seconds).

## Secrets in every theme (big spoilers!)

Every theme hides an easter egg. Once you find one, a **🥚 Secrets** link appears in Discover with your progress
(e.g. 3/14) and a cryptic hint for each one you haven't found yet. Progress is saved on the device.

| Theme | Secret | How to find it |
|---|---|---|
| Light | **Paper Planes**: every nearby post folds into a paper plane, loops around and lands back | Tap an empty spot 3 times quickly, or type `paper` |
| Dark | **Flashlight**: lights out; search with a torch beam for a hiding ghost | Tap an empty spot 3 times quickly |
| Gallery | **Night Watch**: an art thief tiptoes off with a painting; tap him before he escapes | Tap an empty spot 3 times quickly |
| Universe | **Your Constellation**: tap to place up to 12 stars, name it, and it shines in your sky from then on | Double-tap an empty spot |
| Amazon | **Frog Choir**: the frogs glow and croak a tune, taking turns then all together | Tap frogs 5 times within 12 seconds |
| Deep Ocean | **Whale Song**: a huge bioluminescent whale glides past, singing | Tap jellyfish 3 times within 9 seconds, or type `whale` |
| Aurora | **Wish Upon a Star**: make a wish and it's written across the sky in aurora colours | Tap a shooting star while it's flying |
| Sakura Dusk | **Lantern Festival**: night falls and over a hundred lanterns rise | Tap the setting sun 3 times |
| Sahara Night | **Camel Run**: the camel-and-flying-saucer game | Click a camel in the caravan, or type `camel` |
| Neon City | **Turbo Mode**: the city runs at 4× with scanlines and an 80s arpeggio | ↑ ↑ ↓ ↓ ← → ← → B A |
| Noir | **Case Closed**: take the detective's case and find 3 hidden fingerprints in 45 seconds | Tap the man under the street lamp |
| Neo Tokyo | **The Four Gods**: the four dragons circle one great pearl (四神), then burst | Make all four dragons roar within 25 seconds |
| Warp Drive | **Edge of the Universe**: transwarp to the very end of everything ("Population: you") and back | Tap the speed readout 5 times quickly |
| Andromeda | **First Contact**: an alien transmission, decoded letter by letter | Tap the galaxy's bright core 3 times |

## Moderation

- **Community rules.** People accept the rules before their first post (the server refuses posts without that).
  Anyone can reread them from Discover → *Community rules*, or by opening `yoursite/#rules`.
- **Report.** Every post and reply has a Report button with reasons. The post is hidden for the reporter straight away.
  When `REPORT_HIDE_THRESHOLD` different people (default 3) report a post, it's hidden for everyone until reviewed.
- **Block.** Hides all posts from that person on the blocker's device. People are told apart by an anonymous
  ID (a hashed random device ID), never by name.
- **Admin page.** Start the server with `ADMIN_TOKEN=some-long-secret` and open **`/admin.html`**. For each
  reported post you can **keep it** (dismiss the reports), **remove it**, or **remove and ban the poster**
  (deletes all their posts and stops their device posting). Bans are by device. Set `BAN_BY_IP=true` to also ban
  their IP address, but be careful: phone networks often share one IP among many people.
- **Privacy policy.** `public/privacy.html` is a starting point. Fill in the highlighted parts (your name,
  contact email, date, minimum age) and have it checked for your country before launch.

## Settings worth knowing

| Setting | Where | Default |
| --- | --- | --- |
| Max video length | `MAX_VIDEO_SECONDS` in `server.js` and `public/script.js` | 30 |
| Max video size | `MAX_VIDEO_BYTES` (server), `MAX_VIDEO_MB` (browser) | 60 MB |
| Posts per IP per 10 minutes | `POSTS_PER_10_MIN` in `server.js` | 30 |
| Reactions per IP per 10 minutes | `REACTIONS_PER_10_MIN` in `server.js` | 300 |
| Max thought length | `THOUGHT_MAX` in `server.js` and `public/script.js` | 500 |
| Check for new posts and reactions | `POLL_MS` in `public/script.js` | 20 s |

## Before going public

This is a solid starting point for a small community, but a public site needs a few more things:

- **Moderation.** Reports, blocking and an admin queue are built in (see Moderation above). For a large audience,
  consider adding an automatic image/video screening service as well.
- **Storage.** Move uploads to object storage (S3, Cloudflare R2, Cloudinary) and posts to a real database
  (SQLite, Postgres) once traffic grows. The JSON file is rewritten on every change.
- **Accounts** if you want people to manage their posts across devices.
- **HTTPS**, which most hosts (Render, Railway, Fly.io) provide automatically.
