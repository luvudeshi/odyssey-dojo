A giant reaches for you. The card on screen says BLOCK, and under it: "Someone grabs for you". You pull both fists up to your cheeks. The webcam sees it, and the hand misses.

You just practiced covering your head against a grab.

**Odyssey Dojo** teaches self-defense basics in your browser, with your own body as the controller. A giant's grab stands in for a real one, and each move is one you could use. Train alone, or with a friend who joins from somewhere else.

![Inspiration](https://toyeshhm.github.io/odyssey-dojo-images/h-inspiration.png)

In 2024, about 1 in 69 Americans age 12 or older was the victim of at least one violent crime, according to the Bureau of Justice Statistics. Fewer than half of those crimes were reported to police.

About 2 in 100 Americans practice a martial art. Everyone else has to find a class, pay for it and work up the nerve to walk in. Most people never do, so the first time they have to cover their head or get out of the way of a swing, it's for real.

But most laptops have a camera. We wanted the first lesson to be free, one click away, and something you can do with a friend in another city.

The Odyssey gave us the story. Odysseus gets past each monster by knowing what it's about to do and having one answer ready, with Athena in his ear. We built the game the same way, and made Athena the coach.

![1 in 69 Americans were a victim of violent crime in 2024. 2 in 100 practice a martial art. 1 webcam is all you need to train.](https://toyeshhm.github.io/odyssey-dojo-images/stats-2.png)

![What it does](https://toyeshhm.github.io/odyssey-dojo-images/h-what-it-does.png)

### It teaches you to protect yourself

![Polyphemus reaches for you. The card says BLOCK: someone grabs for you.](https://toyeshhm.github.io/odyssey-dojo-images/defend-card.jpg)

- **Each attack comes with a situation.** The first few times Polyphemus swings his club, the card reads "A wide swing from the side". When he reaches for you it reads "Someone grabs for you". All 24 monster attacks have a line like that.
- **Each move has a reason.** After a fight, the game lists what the moves you used are for outside it. The jab: "A fast hand straight out in front holds someone at arm's length so they cannot crowd you".
- **Athena coaches you out loud.** She calls each defense and strike, and a 3D mannequin on the card shows you the move first.
- **You can't fail out of a lesson.** A wrong try says MISS and you go again until the attack lands.
- **The Training Dojo grades every try** as Excellent, Great or Needs improvement, and gives you one thing to fix. It has nine styles, from Boxer and Jiu-jitsu to Self-defense basics: a palm-heel strike, an elbow, a knee, a wrist release. The game calls them "plain moves for getting free and getting away".
- **It slows down for beginners.** Finish a Dojo session as a beginner and the monsters give you 25% more warning before every attack.

It's a first lesson in reacting in time and keeping your distance. It doesn't replace a class, and in a real situation the first choice is still to leave.

### Train with a friend from anywhere

- **Send four letters.** Host a room and you get a four-letter code and a QR code. Your friend types the code on their own laptop, wherever they are. A phone works too, though the game will tell them a laptop is better.
- **Fight the same monster.** The host defends and both of you strike. Land the same strike within 0.4 seconds of each other and it does double damage.
- **A reload is fine.** If your friend's page reloads, they get their seat back.
- **Or they can call.** FaceTime the game's line from an iPhone, with no app, and it picks up. It answered its first real call at 3:21 AM on Sunday and held it for 118.9 seconds. No strike from a caller has been seen on a real call yet.

### The road is the Odyssey

Six stops in Homer's order, from Polyphemus to the Suitors. Each opens with a painted cutscene and ends on a finishing move. For Polyphemus it's the stake from Book 9.

![The Road Home: six stops from Troy to Ithaca](https://toyeshhm.github.io/odyssey-dojo-images/map.jpg)

No camera? Each of the 34 moves has a key. Sign in on the Account page and your fights go on the Hall of heroes, with one board for tonight and one for all time.

![How we built it](https://toyeshhm.github.io/odyssey-dojo-images/h-how-we-built-it.png)

1. **See:** MediaPipe finds 33 points on your body, in the browser.
2. **Read:** each move has a detector. Most of them measure in your own shoulder widths, so your size and your distance from the camera don't matter.
3. **Coach:** the Dojo scores the parts of a move. A jab is checked for reach, height, aim and speed, and the weakest part becomes the tip.
4. **Fight:** the combat rules are plain TypeScript with no browser in them, so we can test a whole fight as code.
5. **Speak:** three.js draws the arenas, monsters and hero. Every voice and sound in a fight is a file that ships with the game.

![Your browser runs the game. Vercel serves the page, Vultr holds rooms and accounts.](https://toyeshhm.github.io/odyssey-dojo-images/architecture.png)

Two tests guard the teaching. One fails if a move has no real-world line, the other if a monster attack has no situation. We wrote each line ourselves against ten sources, from the England Boxing coaching handbook to three police departments' safety guides.

### ElevenLabs: Athena's voice

We generated 141 clips ahead of time, so a normal fight never calls ElevenLabs. There are eight voices: Sarah for Athena, George for Homer, and one for each monster. We also ran the clips through speech to text to check them. It heard `call_knee` as "Me", so we made that one again.

### Chert and LiveKit: a FaceTime call into the fight

A friend FaceTimes the game's line from an iPhone. Chert bridges the call into a LiveKit room where the game's browser tab is waiting, and the game reads the caller's body from the video with the same pose model it uses for the webcam.

The answering is proven on a real call. The pose reading has only run against a stand-in, and the line lives on one laptop.

### Tiger Data: accounts and the Hall of heroes

- **Hypertable:** every finished fight of a signed-in player is a row.
- **Continuous aggregate:** each hero's best score by the hour.
- **`time_bucket_gapfill`:** the last six hours of activity in ten-minute buckets, with the quiet ones as zeros.

We ran the 28 database tests against a real Tiger Data service.

### Vultr and GoDaddy Registry: odysseydojo.club

One small Vultr instance in Dallas runs the server for rooms and accounts, in Docker, with Caddy for https. That server is why your friend doesn't have to be on your Wi-Fi. The page itself is on Vercel, and the https matters: a browser only hands a page the camera over https.

![Tech stack](https://toyeshhm.github.io/odyssey-dojo-images/h-tech-stack.png)

| CATEGORY | TECHNOLOGIES |
|---|---|
| Frontend | React 19, TypeScript 6 (strict), Vite 8 |
| 3D | three.js, React Three Fiber |
| Pose tracking | MediaPipe (runs in the browser) |
| Server | Node.js, Express 5, Zod |
| Calls | LiveKit, Chert |
| Voice and sound | ElevenLabs |
| Database | Tiger Data (Postgres, TimescaleDB) |
| Hosting | Vercel, Vultr, Docker, Caddy |
| Tests | Vitest, 259 test files, seven scripts that play the game in a headless browser |

![Challenges we ran into](https://toyeshhm.github.io/odyssey-dojo-images/h-challenges.png)

- **Not overclaiming.** A Siren's song isn't something you meet on the street, and we weren't going to invent an assault to stand for it. Those attacks carry a general lesson instead. The Sirens' card reads "Being talked into staying: keep your guard, keep moving".
- **Beginners quit when they're marked down.** So a near miss counts, and a move that counts never scores below Great.
- **Losing the camera.** If the camera loses you, the fight pauses and tells you to press any move key and carry on with the keyboard.
- **Strikes didn't look like they landed.** The hit counted but the hero stood still. Now he leaps and his fist meets the weak spot.
- **A restart at 3:05 AM.** The lead's laptop rebooted with a room full of coding agents mid-task. Each had its own folder and branch, so we lost no code.

![Accomplishments that we're proud of](https://toyeshhm.github.io/odyssey-dojo-images/h-accomplishments.png)

- 34 moves, each with a real-world reason, written against ten sources.
- A coach that grades every try, gives one tip and slows the monsters down for a beginner.
- Rooms on a live server, so a friend can join with four letters.
- A browser game that answered a real FaceTime call.
- More than 300 pull requests merged since Saturday afternoon.
- It's live at [odysseydojo.club](https://odysseydojo.club).

![What we learned](https://toyeshhm.github.io/odyssey-dojo-images/h-learned.png)

- One tip worked better than a list of five.
- The detectors we built for combat could also teach. Scoring their parts gave us the coach.
- Watching someone play found more problems than the test suite did.

![What's next for Odyssey Dojo](https://toyeshhm.github.io/odyssey-dojo-images/h-next.png)

- Tune the detectors on more real bodies.
- Prove a friend's strikes on a real FaceTime call, and move the line off one laptop.
- Two players on one camera. The logic is merged and has no card on the menu yet.
- A report card after each fight, with a grade and one thing to work on for every move.

Play it at **[odysseydojo.club](https://odysseydojo.club)**. Start in the Training Dojo.

*Credits: skies and textures from [Poly Haven](https://polyhaven.com) (CC0). Models by Quaternius and KayKit (CC0), and a column by Victor Viña (CC BY 3.0). Paintings and banner icons generated by the team with FLUX.2 Klein. Voices and sound effects generated with ElevenLabs. Music: "The Rise Of Heroes", "Passage Of Arms" and "The Fall Of Heroes" by Shane Ivers (https://www.silvermansound.com), CC BY 4.0. Violent crime figures from the Bureau of Justice Statistics, [Criminal Victimization, 2024](https://bjs.ojp.gov/library/publications/criminal-victimization-2024). Martial arts figure from the Sports & Fitness Industry Association's 2024 report, as cited by [Gymdesk](https://gymdesk.com/blog/martial-arts-industry-statistics).*
