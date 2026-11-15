![Odyssey Dojo main menu: a ship between Scylla and Charybdis in a storm](https://toyeshhm.github.io/odyssey-dojo-images/menu.jpg)

A giant reaches for you. A card on the screen says BLOCK, and below it: "Someone grabs for you". You bring both fists up to your cheeks. The webcam sees it, and the hand misses.

**Odyssey Dojo** is a browser game that teaches self-defense basics with your own body as the controller. You train alone or with a friend, and the road you train on is the Odyssey.

![Inspiration](https://toyeshhm.github.io/odyssey-dojo-images/h-inspiration.png)

About 2 in 100 Americans practice a martial art. A class takes money, a schedule and the nerve to walk in. A laptop already has a camera.

The Odyssey gave us the story. Odysseus does not get home by being the strongest. He gets past each monster by knowing what it will do and having one answer ready, with Athena beside him telling him what to do. That is self-defense, and that is a coach.

![2 in 100 Americans practice a martial art. 34 moves, each with a real-world lesson. 1 webcam is all you need.](https://toyeshhm.github.io/odyssey-dojo-images/stats.png)

![What it does](https://toyeshhm.github.io/odyssey-dojo-images/h-what-it-does.png)

![Polyphemus reaches for you. The card says BLOCK: someone grabs for you.](https://toyeshhm.github.io/odyssey-dojo-images/defend-card.jpg)

- **Every attack is a real situation.** Polyphemus swings his club and the card says "A wide swing from the side". All 24 monster attacks carry a line like it.
- **Every move teaches one thing.** 34 moves, each with one line on what it is for outside the game. Jab: "A fast hand straight out in front holds someone at arm's length so they cannot crowd you".
- **Athena coaches out loud.** She calls each defense and strike, and a 3D mannequin on the card acts it out first.
- **A wrong try says MISS, and you go again.** The card stays up until the attack lands.
- **Defending pays.** Five defends fill a power disc, and Athena lends you her aegis.
- **No camera needed.** Every move has a key.

![A strike lands on the Cyclops's eye: GOOD, combo x4](https://toyeshhm.github.io/odyssey-dojo-images/strike.jpg)

**The Training Dojo grades every try** as Excellent, Good or Needs improvement, and gives one tip, never a list. It has nine styles, from Boxer to Muay Thai. Your result then changes the fights: a beginner gets 25% more warning before every attack.

![The Training Dojo: a jab, graded, with one tip](https://toyeshhm.github.io/odyssey-dojo-images/dojo.jpg)

**Six stops in Homer's order,** from Polyphemus to the Suitors. Each opens with a painted cutscene and ends on a finishing move. For Polyphemus it is the stake from Book 9.

![The Road Home: six stops from Troy to Ithaca](https://toyeshhm.github.io/odyssey-dojo-images/map.jpg)

![Polyphemus, the Cyclops: the painting that opens his fight](https://toyeshhm.github.io/odyssey-dojo-images/cutscene.jpg)

**Five heroes to fight as:** Odysseus, Poseidon, Zeus, Athena and Achilles.

![Choose your character](https://toyeshhm.github.io/odyssey-dojo-images/characters.jpg)

**Play with a friend.** Host a room and a friend joins by four-letter code or QR code, from a laptop or a phone. Throw the same strike within 0.4 seconds of each other and it does double damage.

![Your room: a four-letter code and a QR code for a friend](https://toyeshhm.github.io/odyssey-dojo-images/multiplayer.jpg)

**The Account page** keeps your fights, wins, best score and 23 trophies.

![The Account page: trophies, fights, wins and best score](https://toyeshhm.github.io/odyssey-dojo-images/account.jpg)

It is practice for reacting in time and keeping your distance. It does not replace a class, and in a real situation the first choice is to leave.

![How we built it](https://toyeshhm.github.io/odyssey-dojo-images/h-how-we-built-it.png)

![See, Read, Coach, Fight, Speak](https://toyeshhm.github.io/odyssey-dojo-images/pipeline.png)

1. **See:** MediaPipe finds 33 points on your body, in the browser.
2. **Read:** each move has a detector that measures in your own shoulder widths, so body size and camera distance do not matter.
3. **Coach:** the Dojo scores the parts of a move. A jab is checked for reach, height, aim and speed, and the weakest part becomes the tip.
4. **Fight:** the combat rules are plain TypeScript with no browser in them, so we test a whole fight as code.
5. **Speak:** three.js draws the arenas, monsters and hero. Every voice and sound in a fight is a file that ships with the game.

![Your browser runs the game. Vercel serves the page, Vultr holds rooms and accounts.](https://toyeshhm.github.io/odyssey-dojo-images/architecture.png)

Two tests guard the teaching: one fails if a move has no real-world line, the other if a monster attack has no situation. We wrote each line ourselves against ten sources, from the England Boxing coaching handbook to three police departments' safety guides.

![ElevenLabs](https://toyeshhm.github.io/odyssey-dojo-images/t-elevenlabs.png)

### Athena is the coach

- **141 clips,** generated ahead of time, so a normal fight never calls ElevenLabs.
- **Eight voices:** Sarah for Athena, George for Homer, and one for each monster.
- **Checked by machine.** We ran the voice clips through speech to text. It heard `call_knee` as "Me", so we made that clip again.

![Chert and LiveKit](https://toyeshhm.github.io/odyssey-dojo-images/t-facetime.png)

### A FaceTime call that joins the fight

A friend FaceTimes the game's line from an iPhone, with no app. Chert bridges the call into a LiveKit room where the game's browser tab is waiting. The phone sees the fight, and the game reads the friend's body from the call's video with the same pose model.

On Sunday at 3:21 AM the game answered a real call and held it for 118.9 seconds. Today it runs on one laptop with a trial line.

![Tiger Data](https://toyeshhm.github.io/odyssey-dojo-images/t-tiger.png)

### Accounts and the Hall of heroes

- **Hypertable:** every finished fight of a signed-in player is a row.
- **Continuous aggregate:** each hero's best score by the hour.
- **`time_bucket_gapfill`:** the last six hours of activity, with the quiet stretches as zeros.

We ran the 27 database tests against a real Tiger Data service.

![Vultr](https://toyeshhm.github.io/odyssey-dojo-images/t-vultr.png)

### The server behind rooms and accounts

One small Vultr instance in Dallas runs the server for rooms and accounts, in Docker, with Caddy for https. The page itself is on Vercel.

![GoDaddy Registry](https://toyeshhm.github.io/odyssey-dojo-images/t-domain.png)

### odysseydojo.club

The name says what it is: the Odyssey, and a dojo. The https matters too. A browser only hands a page the camera over https.

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
| Tests | Vitest, 238 test files, seven scripts that play the game in a headless browser |

![Challenges we ran into](https://toyeshhm.github.io/odyssey-dojo-images/h-challenges.png)

- **Teaching without overclaiming.** A Siren's song is not something you meet on the street. We did not invent an assault to stand for it. Those attacks carry a general lesson, marked as one.
- **Training has to be kind.** A beginner who is marked down stops trying. A near miss counts, and a move that counts never scores below Good.
- **A bad room cannot end the demo.** If the camera loses you, the fight pauses and says "Or press any move key to play on the keyboard".
- **Strikes did not look like they landed.** The hit counted, but the hero stood still. Now he leaps so his fist meets the weak spot.
- **A restart at 3:05 AM.** The lead's laptop rebooted with a room full of coding agents mid-task. Each had its own folder and branch, so no code was lost.

![Accomplishments that we're proud of](https://toyeshhm.github.io/odyssey-dojo-images/h-accomplishments.png)

- 34 moves, each with a real-world line and a cited source.
- A coach that grades every try, gives one tip and changes the fights to fit you.
- A full game you can play with only your body, or only a keyboard.
- A real FaceTime call answered by a browser game.
- 291 pull requests merged in the first 16 hours.
- It is live at [odysseydojo.club](https://odysseydojo.club).

![What we learned](https://toyeshhm.github.io/odyssey-dojo-images/h-learned.png)

- **One tip beats five.** A player can fix one thing on the next try.
- **The same detector can fight and teach.** We built detectors for combat. Measuring their parts gave us the coach for free.
- **A playtest beats a test suite** for finding what a player trips over.

![What's next for Odyssey Dojo](https://toyeshhm.github.io/odyssey-dojo-images/h-next.png)

- Tune the detectors on more real bodies.
- Two players on one camera. The logic is merged and has no card on the menu yet.
- A defense panel that shows what you blocked and what to practise next.
- FaceTime past a trial line that lives on one laptop.

Play it at **[odysseydojo.club](https://odysseydojo.club)**. Open the Training Dojo first.

*Credits: skies and textures from [Poly Haven](https://polyhaven.com) (CC0). Models by Quaternius and KayKit (CC0), and a column by Victor Viña (CC BY 3.0). Paintings and banner icons generated by the team with FLUX.2 Klein. Voices and sound effects generated with ElevenLabs. Music: "The Rise Of Heroes", "Passage Of Arms" and "The Fall Of Heroes" by Shane Ivers (https://www.silvermansound.com), CC BY 4.0. Martial arts figure from the Sports & Fitness Industry Association's 2024 report, as cited by [Gymdesk](https://gymdesk.com/blog/martial-arts-industry-statistics).*
