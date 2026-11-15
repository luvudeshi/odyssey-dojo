// The game's whole sound as one stream, for a call that sends it to someone else (the FaceTime card publishes its
// track to the call's room). It carries what the player hears, at the levels the player hears it: the effects, the
// cues, a god's power, a stop's ambience and events, the music, and the spoken clips (Athena, Homer, the monsters'
// taunts and the lines written at run time). It does not carry the microphone or the call's incoming sound.
//
//   const sound = gameSoundStream();                                   // null where there is no Web Audio
//   const [track] = sound?.getAudioTracks() ?? [];
//   if (track) await room.localParticipant.publishTrack(track);        // ... and stopGameSoundStream() when the call ends
//
// Until gameSoundStream() is called nothing is made and nothing is connected: the game sounds as it always did. While
// the stream is live each sound path is also connected to it, beside its own way to the speakers (soundTap.ts).
// A peak that would be over full scale (a voice line and an effect together) is held under it on the stream, since a
// call's encoder would clip it; everything quieter is at the player's level. The call's own additions (a microphone,
// a chime) are mixed in after this and are not held down by it.
// The stream is silent while the game is: it still delivers data. It stalls while the tab is hidden, as the game's
// sound does (sfx.ts stops the audio clock there). The spoken clips are only in it in Chrome and Edge.
import { log } from "../core/log";
import { sharedAudioContext } from "./sfx";
import { closeTap, openTap } from "./soundTap";

/**
 * The game's sound as a stream with one audio track. Sounds that start later are in it too. Calling it again while
 * that track is live gives the same stream; after stopGameSoundStream, or once its track was stopped, a new one.
 * Null where the browser has no Web Audio. It never throws.
 */
export function gameSoundStream(): MediaStream | null {
  try {
    const context = sharedAudioContext();
    return context ? openTap(context) : null;
  } catch (error) {
    log("warn", "sound_out.failed", error);
    return null;
  }
}

/** Ends the stream: its track is stopped and the game's sound is no longer connected to it. Safe to call at any time. */
export function stopGameSoundStream(): void {
  try {
    closeTap();
  } catch (error) {
    log("warn", "sound_out.stopFailed", error);
  }
}
