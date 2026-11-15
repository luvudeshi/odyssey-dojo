// What "genClips.ts power" asks ElevenLabs for: the sound of each god's power going off, one clip per god.
// Keys are god ids (src/ai/gods/gods.ts), the same as the file under public/audio/power and the name in index.json there.
// Prompts describe a sound only: no words, no speech, no artist, film, game or existing piece.

export interface PowerClip {
  readonly prompt: string;
  readonly seconds: number;
}

export const POWER_CLIPS: Readonly<Record<string, PowerClip>> = {
  // Thunderbolt.
  zeus: { prompt: "One huge crack of thunder striking very close, a sharp electric snap at once and then a short heavy rumble", seconds: 2 },
  // Trident sweep.
  poseidon: { prompt: "A great ocean wave crashing down on rocks, a heavy rush of water and a burst of spray", seconds: 2.2 },
  // Aegis push.
  athena: { prompt: "A large bronze shield struck hard, one deep metallic clang at once with a bright ring that fades", seconds: 1.8 },
  // Swift dash.
  hermes: { prompt: "A very fast rush of wind sweeping past with a flutter of beating wings, one quick whoosh", seconds: 1.2 },
  // Moon arrow. Three takes were made and the second is the one in the game. The first asked for an arrow "whistling
  // fast through the air and striking home" and came back as one twang with a flight too faint to hear (-37 LUFS). This
  // prompt gave a loud snap and thud that starts at once. A third asked for "a long rising whistle" and put its one
  // loud sound half a second in, too late for a power that has just gone off.
  artemis: { prompt: "An archer's shot: a sharp bowstring twang, then a loud arrow whooshing fast through the air, ending in a solid thud as it strikes", seconds: 1.5 },
  // Sun burst.
  apollo: { prompt: "A bright blaze of fire swelling fast into a burst of radiant light, a rising roar with a warm shimmering flare", seconds: 2 },
};
