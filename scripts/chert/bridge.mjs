// The Odyssey Dojo bridge: the LiveKit agent that `chert dev` puts in every room of the game's FaceTime line.
//
// WHERE IT RUNS. Not in this repo: it needs Chert's starter folder. On the computer that holds the line:
//   1. npx @trychert/facetime new odyssey-dojo --video     (makes a folder with chert-rooms.mjs, greet.mjs,
//      package.json and node_modules; it is outside the game's repo, and the game's package.json gains nothing)
//   2. Copy this file and room-note.mjs into that folder. This file takes the place of the starter's agent.mjs.
//   3. Terminal 1, in that folder:  node --env-file=<the game's .env> bridge.mjs start
//      Terminal 2:                  npx @trychert/facetime dev --agent odyssey-dojo --env-file <the game's .env>
//   The .env holds LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET of one LiveKit project: the same three the
//   game's server reads. Both terminals stay open for as long as the line is ours.
//
// WHY IT IS SILENT. Chert takes sound from exactly one participant in the room, and the picture only from that same
// participant; a second participant that publishes sound ends the call. The game's browser tab is that participant:
// it publishes the fight (picture) and the game's sound, and reads the caller's camera. So this worker publishes
// nothing and subscribes to nothing. Its jobs are to be in the room (Chert only answers a call when the named agent
// is there) and to write down which room that is (room-note.mjs), as a second way for the game's server to find it.
// The server's first way is to ask LiveKit itself: see server/lib/chertWaitingRoom.ts and docs/facetime.md.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent } from '@livekit/agents';
import { runAgent } from './chert-rooms.mjs';
import { bridgeReady } from './greet.mjs';
import { noteAfter } from './room-note.mjs';

const here = dirname(fileURLToPath(import.meta.url));
/** Where the note goes. The game's server reads FACETIME_ROOM_FILE, or ~/.chert/odyssey-dojo-room.json: point one at the other. */
const ROOM_FILE = process.env.ODYSSEY_ROOM_FILE || join(here, '..', 'room.json');

/** Each room is its own process, so the note is read, changed and put back whole (a rename, never a half-written file). */
async function note(change) {
  let before = null;
  try { before = JSON.parse(await readFile(ROOM_FILE, 'utf8')); } catch { /* no note yet, or a broken one */ }
  await mkdir(dirname(ROOM_FILE), { recursive: true });
  const next = `${ROOM_FILE}.${process.pid}.tmp`;
  await writeFile(next, JSON.stringify(noteAfter(before, change, Date.now())) + '\n');
  await rename(next, ROOM_FILE);
}

const agent = defineAgent({
  entry: async ctx => {
    // Subscribe to nothing: the game reads the caller's camera, not this worker.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_NONE);
    const room = ctx.room;
    const name = room.name ?? ctx.job?.room?.name ?? '';
    const state = { room: name, caller: null, ready: bridgeReady(room.metadata) };
    const save = () => note(state).catch(error => console.error('[odyssey] could not write the room file', error));
    // A call that found no waiting room: the caller can be here already.
    for (const participant of room.remoteParticipants.values()) if (participant.identity.startsWith('chert-bridge-')) state.caller = participant.identity;
    console.log(`[odyssey] in room ${name}, ${state.caller ? 'with a caller' : 'waiting for a FaceTime call'}`);
    await save();
    room.on('participantConnected', participant => {
      if (!participant.identity.startsWith('chert-bridge-')) return;
      state.caller = participant.identity;
      console.log(`[odyssey] a caller is in the room: ${participant.identity}`);
      void save();
    });
    room.on('roomMetadataChanged', () => {
      if (state.ready || !bridgeReady(room.metadata)) return;
      state.ready = true;
      console.log('[odyssey] FaceTime is ready: the game must be heard within 10 seconds');
      void save();
    });
    ctx.addShutdownCallback(async () => {
      console.log(`[odyssey] room ${name} is over`);
      await note({ room: name, over: true }).catch(() => {});
    });
  },
});

export default agent;

runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'odyssey-dojo' });
