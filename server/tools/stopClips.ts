// What "genClips.ts stops" asks ElevenLabs for: one entry per clip named in src/audio/stopSounds.ts.
// Keys are "<enemy id>/<clip>", the same as the file under public/audio/stops and the name in index.json there.
// Prompts describe a sound only: no words, no speech, no artist, film, game or existing piece.

export interface StopClip {
  readonly prompt: string;
  readonly seconds: number;
  /** Set for an ambience: the clip is asked to loop, at a lower bitrate so 30 seconds stay under 400 KB. */
  readonly loop?: true;
}

/** No clip may be bigger than this on disk. */
export const STOP_CLIP_MAX_BYTES = 400_000;
/** Ambience is 30 seconds long: about 360 KB at 96 kbps, where 128 kbps would be about 480 KB. */
export const STOP_AMBIENCE_FORMAT = "mp3_44100_96";

const EVEN = "Continuous and even from start to end, no music, no speech";

export const STOP_CLIPS: Readonly<Record<string, StopClip>> = {
  "circe/ambience": {
    // A first take asked for a fire "crackling" and came back as a very quiet bed with a few sharp pops, so this asks for a soft one.
    prompt: `Inside a stone hall at night: a low wood fire burning softly in a hearth, a steady gentle hiss and murmur of embers, and through the open doors a forest at night, crickets and a soft wind in the trees. ${EVEN}`,
    seconds: 30,
    loop: true,
  },
  "circe/wand": { prompt: "A magic wand charging up, crackling sparks of energy with a short rising shimmer", seconds: 1.2 },
  "circe/squeal": { prompt: "A pig squealing in fright, one short sharp squeal", seconds: 1.2 },
  "circe/hurt": { prompt: "A hard punch landing, a woman's short gasp of pain and a crackle of breaking magic", seconds: 0.9 },
  "circe/defeat": {
    prompt: "A spell breaking: a burst of shattering magical energy, a woman's wordless cry falling away, sparks fizzling out",
    seconds: 2.5,
  },

  "sirens/ambience": {
    prompt:
      "A calm sea lapping gently on a rocky shore, and far off across the water women's voices singing one slow haunting melody on open vowels, with no words. Continuous and even from start to end, no instruments, no speech",
    seconds: 30,
    loop: true,
  },
  "sirens/note": { prompt: "A woman's voice singing one long clear wordless note that rises, eerie and beautiful, with a little echo", seconds: 1.8 },
  "sirens/swoop": { prompt: "Large wings swooping down fast through the air, a rush of feathers and a harsh bird screech", seconds: 1.2 },
  "sirens/hurt": { prompt: "A punch landing on a large bird, a shrill shriek of pain and a flutter of feathers", seconds: 0.9 },
  "sirens/wave": { prompt: "A wave slapping hard against the wooden side of a ship, one heavy wet smack with spray", seconds: 1 },

  "scylla/ambience": {
    prompt: `A narrow sea strait between high cliffs: a strong wind howling through the rocks, waves washing and breaking on wet stone. ${EVEN}`,
    seconds: 30,
    loop: true,
  },
  "scylla/snarl": { prompt: "Several monstrous dog-like heads snarling together, a pack of low vicious growls rising", seconds: 1.3 },
  "scylla/snap": { prompt: "Huge jaws snapping shut, a sharp bite with a clack of teeth", seconds: 0.7 },
  "scylla/hurt": { prompt: "A heavy punch landing on a sea monster, a high yelping screech of pain", seconds: 0.9 },
  "scylla/howl": { prompt: "A sea monster with many heads howling in rage, several beasts howling at once, echoing off cliffs", seconds: 2 },

  "charybdis/ambience": {
    prompt: `A vast whirlpool roaring at sea: deep water churning and spinning, a constant heavy roar with a hollow sucking undertone. ${EVEN}`,
    seconds: 30,
    loop: true,
  },
  "charybdis/gulp": { prompt: "The sea being swallowed down a giant drain, a deep sucking gurgle pulling downward", seconds: 1.6 },
  "charybdis/spout": { prompt: "A huge column of sea water bursting upward, a rising rush and roar of spray", seconds: 1.3 },
  "charybdis/crash": { prompt: "A big wave crashing down on a wooden deck, a heavy boom of water", seconds: 1.2 },
  "charybdis/hurt": { prompt: "A heavy blow striking deep water, a booming splash with a low groan from the depths", seconds: 1 },

  "suitors/ambience": {
    prompt:
      "A great feasting hall in ancient Greece: a large hearth fire crackling, a crowd of men murmuring and laughing in the background, cups and plates clattering. The voices are indistinct, with no clear words. Continuous and even from start to end, no music",
    seconds: 30,
    loop: true,
  },
  "suitors/throw": { prompt: "A spear thrown hard through the air, a short grunt of effort and a fast whoosh", seconds: 0.9 },
  "suitors/sword": { prompt: "A bronze sword drawn quickly from its scabbard, a sharp metallic scrape and ring", seconds: 1 },
  "suitors/jeer": { prompt: "A group of rough men jeering and laughing mockingly, with no words", seconds: 1.6 },
  "suitors/hurt": { prompt: "A hard punch landing on a man in leather armour, a thud and a man's grunt of pain", seconds: 0.9 },
};
