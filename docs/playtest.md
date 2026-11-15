# Playtest checklist and bug log

How to test a build by hand, and what has been found so far. Run the checklist before each checkpoint and after anything lands that changes the fight.

## Before you start

```bash
make setup
```

```bash
make dev
```

Open http://localhost:5173 in Chrome. Keep the browser's console open (F12): any red error is a bug, whatever else happens. Write down the commit you tested (`git rev-parse --short HEAD`).

## Checklist

Each step says what to do and what you should see. Mark it pass, fail or not run in the table at the bottom.

### A. Keyboard fight (no camera)

1. **Title.** Load the page. You see the title and two buttons.
2. **Keyboard only.** Click it. You see the style choice with a line under each style.
3. **Start as Boxer.** The monster's name shows for about a second and a half, then the first red prompt card.
4. **Each defense.** Hold the key on the card until the attack lands: Space (block), Left, Right, Down. Your health does not drop and a gold strike card follows.
5. **Each strike.** Press the key on the gold card (J, K, L). The monster's health drops, the score rises, and from the second hit in a row a combo count shows.
6. **Miss on purpose.** Let one attack land. Your health drops and the combo resets.
7. **Whiff on purpose.** Let one strike window run out. No damage either way, and the combo resets.
8. **Prompts shrink.** After two successes with a move its card loses the stick figure and hint. After five it should still be clear which move is wanted (see bug 1).
9. **Win.** Finish the fight. You see the win text, your score and a "Next fight" button. Time it: a clean run should take 90 to 150 seconds.
10. **Start as Jiu-jitsu.** "Change style", pick Jiu-jitsu, and check its three strikes (P, G, H) land.

### B. Losing and restarting

11. **Lose.** Start a fight and touch nothing. In about a minute you see "You are struck down", the score, "Try again" and "Change style". No prompt card is left on screen.
12. **Try again.** Both health bars are full and the score is 0.
13. **Refresh mid-fight.** Press F5 during a fight. You are back at the title with no error. (Progress is not saved; that is expected.)
14. **Leave and come back.** Switch to another tab for ten seconds during a fight, then return. The fight carries on from one moment later, not ten seconds later, and nothing is stuck.

### C. Keys behaving badly

15. **Caps Lock.** Turn Caps Lock on and press a strike key (see bug 2).
16. **Hold everything.** Hold Space and all three arrows through several attacks (see bug 3).
17. **Wrong strike.** Press a strike the card did not ask for. Nothing happens and there is no penalty.
18. **Hold a key while clicking away.** Hold Space, click another window, release, click back (see bug 4).

### D. Webcam fight (one run per style)

19. **Allow the camera.** Click "Fight with your body" and allow it. Your picture shows bottom left, mirrored, and a bronze figure copies you.
20. **Refuse the camera.** Reload, click the webcam button and block it. You get a notice and land on keyboard controls.
21. **Stand still for ten seconds.** Nothing fires. Add `?debug` to the address to watch each move's confidence: all should stay under 0.4.
22. **Each defense with your body.** Block (fists at your face), duck, lean left, lean right. Each stops its attack.
23. **Each strike with your body.** Each fires once per throw, not twice, and not when you only pull your arm back.
24. **A full fight with no keyboard.** Win it. Note any move you had to repeat.

### E. Camera trouble

25. **Step out of frame** for three seconds, then come back. The fight should pause and tell you (issue #8); note what it does today.
26. **Half in frame.** Stand so your hips are cut off. Note which moves stop working.
27. **Bad light.** Turn the room light off, or stand with a window behind you. Note which moves stop working.
28. **Second person walks behind you.** The figure should keep following you.
29. **Far and near.** Stand one metre, then three metres from the camera. Leans and ducks should work at both.

### F. Performance

30. **Frame rate.** Play 30 seconds with the browser's frame-rate meter on (DevTools, Rendering, Frame Rendering Stats). It should hold near 60 on the demo laptop.
31. **Ten fights in a row** without reloading. It should not slow down.

## Runs

| Date | Commit | Who | A | B | C | D | E | F |
|---|---|---|---|---|---|---|---|---|
| Sat 14 Nov, 3:20 PM | `9e95d61` | tagrawal029's agent, keys sent by script in Chrome | 1 to 8 and 10 pass; 9 not finished (see bug 1) | 11 and 12 pass; 13 and 14 not run | 15 to 17 run; 18 read from the code, not run | not run: needs a person | not run | not run |
| Sat 14 Nov, evening | `f8b1891` (before the pebble interface) | tagrawal029's agent, `node scripts/smoke.mjs --styles=all`, headless Chrome 157 on the Windows laptop | 6 stops by 5 styles, 30 fights: all 30 won, 0 console errors, 0 page errors, 0 failed requests. Edge 157 stopped after 12 of 30 (all won, no errors) because `main` moved | not run | not run | not run | not run | not run |
| Sat 14 Nov, evening | `28d9c39` (pebble interface merged) | the same script, headless Chrome 157 and Edge 157 | Chrome: 30 of 30 won, 0 console errors, 0 page errors, 0 failed requests. Edge: stopped after 11 of 30 (all won, no errors) because `main` moved again | not run | not run | not run | not run | not run |
| Sat 14 Nov, night | `d75694b` (star-chart HUD merged) | the same script, reduced run | Polyphemus with each of the 5 styles in Chrome: 5 of 5 won, no errors. Polyphemus as Boxer in Edge: won, no errors. All six stops as Boxer in Chrome with the move ghost on (`?ghost=1`): 6 of 6 won, no errors. The other five stops were not played with every style on this commit; the full 30 in both browsers is still to do | not run | not run | not run | not run | not run |

The smoke runs found no bug: no console error, no page error, no failed request and no fight that did not end, so they add nothing to the bug log below. They are keyboard only: no camera, no pose tracking.

What the script run measured: with every prompt answered and each strike thrown half a second after its card, the first 14 strikes took 41 seconds and brought Polyphemus to 46% with no damage taken, which is on pace for about 90 seconds. Touching nothing, the fight was lost after about a minute.

## Bugs

| # | What happens | Steps to repeat | Seen on | Belongs to | Status |
|---|---|---|---|---|---|
| 1 | Once a move has been done right five times, its card disappears and only a thin timer bar is left. Nothing on screen says which defense or which strike is wanted, so a player who was winning cleanly starts taking hits. In the script run the player took no damage for 41 seconds, then lost 18 health in the next 8. | Keyboard fight as Boxer. Answer every prompt. Watch the prompt after your fifth block. | `9e95d61` | #24 (ghost outline), the HUD | Reported on #24 |
| 2 | With Caps Lock on, or Shift held, the letter keys do nothing: strikes cannot be thrown. Arrows and Space still work. The keyboard is the demo fallback, so this can strand a judge. | Start a fight, turn Caps Lock on, press the strike key on the card. | `9e95d61` | `src/input/keyboard.ts` (lead) | Reported on #40 |
| 3 | Holding Space and all three arrows at once stops every attack: no need to read the prompt. Keyboard only; a body cannot do it. | Hold all four defense keys through several attacks. | `9e95d61` | `src/input/keyboard.ts` or the engine (lead) | Reported on #40 |
| 4 | A defense key held while the window loses focus stays held until that key is pressed again, because the key-up never arrives. Read from the code, not yet seen by hand. | Hold Space, click another window, release Space, click back. Block now stays on. | `9e95d61` | `src/input/keyboard.ts` (lead) | Reported on #40 |
| 5 | After Polyphemus, "Next fight" leads to a monster with no 3D model, shown as a purple block. Read from the code; the win was not reached in this run. | Win the first fight and click "Next fight". | `9e95d61` | #26 (quest map), #27 (Scylla) | Reported on #26 |
| 6 | Online room: a guest whose page closes or reloads in the middle of a fight and who joins the same room again never sees the fight. For about 20 seconds the join is refused with "That room already has two fighters."; then the guest is let in and its page stays on "You are in. Waiting for the host to start." while the host's fight goes on. No console error on either page. The same with the guest on the event stream and with the guest polling. | `node scripts/rooms-smoke.mjs --runs=rejoin` (docs/rooms.md). By hand: host a room, join from a second page, start a fight, close the guest's page, open `/?room=CODE` again and join. | `f8b1891` | `src/net/host.ts` and `src/screens/FightScreen.tsx` (the host says which fight is on only once, when it begins); the 20 seconds are `AWAY_MS` in `server/lib/rooms.ts` | Reported as #222 |

Not bugs, but worth knowing: a wrong strike key costs nothing, so pressing J, K and L together always lands the strike; and a strike pressed during the defense beat is thrown away, not saved for the strike beat.
