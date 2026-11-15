// Shared contracts. Owned by the lead: propose changes in a PR of their own.
// Everything else in src/ depends on this file; it depends on nothing.

/** One body point. `image` points are 0..1 of the mirrored webcam picture; `world` points are meters from the hips. */
export interface Landmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility: number;
}

/** One tracked webcam frame, already mirrored so the player's left is screen left. */
export interface PoseFrame {
  readonly t: number;
  readonly image: readonly Landmark[];
  readonly world: readonly Landmark[];
}

/** The player's neutral stance, measured at the start of a fight. */
export interface Baseline {
  readonly centerX: number;
  readonly shoulderY: number;
  readonly shoulderWidth: number;
  /** Shoulder to shoulder on the 3D body, in metres: the ruler for 3D distances. Left out by code that has no 3D points. */
  readonly shoulderWidth3d?: number;
  /** Middle of the shoulders to middle of the hips on the 3D body, in metres: the ruler for 3D heights. */
  readonly torsoLength3d?: number;
}

/** About one second of frames, oldest first. */
export interface PoseHistory {
  readonly frames: readonly PoseFrame[];
  readonly baseline: Baseline | null;
}

/** Arm positions for the prompt card's stick figure, in a 100x100 box. Player's left is screen left. */
export interface MoveDiagram {
  readonly leftElbow: readonly [number, number];
  readonly leftWrist: readonly [number, number];
  readonly rightElbow: readonly [number, number];
  readonly rightWrist: readonly [number, number];
  readonly shiftX?: number;
  readonly shiftY?: number;
  /** Leg positions for kicks; standing legs are drawn when these are left out. */
  readonly leftKnee?: readonly [number, number];
  readonly leftFoot?: readonly [number, number];
  readonly rightKnee?: readonly [number, number];
  readonly rightFoot?: readonly [number, number];
}

/** A move the player can do. One file per move in src/moves/defs. */
export interface MoveDef {
  readonly id: string;
  readonly name: string;
  /** "defend" moves are held when an attack lands; "strike" moves are thrown once. */
  readonly kind: "defend" | "strike";
  /** The word on the prompt card, e.g. "BLOCK". */
  readonly prompt: string;
  /** One line telling the player how to do it. */
  readonly hint: string;
  /** Keyboard fallback, as a KeyboardEvent.key value. */
  readonly key: string;
  /** Drawn on the prompt card and as the ghost outline the player lines up with. */
  readonly diagram: MoveDiagram;
  /** One line on what this move is for in real self-defense. */
  readonly teaches?: string;
  /** 0..1: how sure we are the player is doing this move right now. */
  detect(history: PoseHistory): number;
  /** 0..1: how well a strike that just fired was thrown (speed, extension, aim). Left out: 0.7. */
  quality?(history: PoseHistory): number;
}

/** A fighting style: the strikes the game will ask this player for. One file per style in src/styles/defs. */
export interface FightingStyle {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly strikes: readonly [string, ...string[]];
}

export interface EnemyAttack {
  readonly id: string;
  readonly name: string;
  /** Warning time before the attack lands. */
  readonly telegraphMs: number;
  readonly damage: number;
  /** Id of the defend move that stops it. */
  readonly counter: string;
  /** How often it comes up next to the other attacks. Left out: 1. */
  readonly weight?: number;
}

/** A stretch of the fight. The enemy is in the last phase whose `belowHp` its health has dropped to. */
export interface EnemyPhase {
  readonly name: string;
  /** Share of full health, 0..1, at which this phase starts. The first phase is 1. */
  readonly belowHp: number;
  /** Ids from the enemy's `attacks` used in this phase. */
  readonly attackIds: readonly [string, ...string[]];
  /** Multiplies every warning time: below 1 is faster. */
  readonly telegraphScale: number;
}

export interface WeakSpot {
  readonly id: string;
  readonly label: string;
  /** Where the marker floats, in the monster model's own space. */
  readonly position: readonly [number, number, number];
  /** Strike ids that can hit it. The engine picks one the player's style has. */
  readonly moves: readonly string[];
}

/** A monster as data. One file per enemy in src/enemies/defs. Its 3D model lives in src/render/monsters/models. */
export interface EnemySpec {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  /** Position in the ladder of fights, lowest first. */
  readonly order: number;
  readonly hp: number;
  readonly strikeWindowMs: number;
  readonly attacks: readonly [EnemyAttack, ...EnemyAttack[]];
  readonly weakSpots: readonly [WeakSpot, ...WeakSpot[]];
  readonly taunts: readonly string[];
  /** Left out: one phase using every attack at normal speed. */
  readonly phases?: readonly [EnemyPhase, ...EnemyPhase[]];
  /** Id of the strike that ends the fight once health reaches zero. Left out: the fight ends at zero. */
  readonly finisher?: string;
  /** Where on Odysseus's route this fight happens, and the book of the Odyssey, for the quest map. */
  readonly place?: string;
  readonly book?: number;
}

export type CombatPhase =
  | { readonly kind: "intro" | "recover"; readonly msLeft: number }
  | { readonly kind: "defend"; readonly attack: EnemyAttack; readonly msLeft: number; readonly totalMs: number }
  | {
      readonly kind: "strike";
      readonly weakSpot: WeakSpot;
      readonly move: string;
      readonly msLeft: number;
      readonly totalMs: number;
    }
  | { readonly kind: "finisher"; readonly move: string; readonly msLeft: number; readonly totalMs: number }
  | { readonly kind: "won" | "lost" };

export interface CombatState {
  readonly playerHp: number;
  readonly enemyHp: number;
  readonly phase: CombatPhase;
  readonly combo: number;
  readonly score: number;
  /** Times each move has been done right; drives how much of the prompt is shown. */
  readonly mastery: Readonly<Record<string, number>>;
  readonly seed: number;
  /** Index into the enemy's phases. */
  readonly phaseIndex: number;
  /** 0..1 divine power meter; spent by the god's gesture. */
  readonly power: number;
  readonly players: 1 | 2;
}

/** One strike thrown this frame. */
export interface Strike {
  readonly move: string;
  /** 0..1: how well it was thrown. Scales damage. */
  readonly quality: number;
  /** Which player threw it. */
  readonly player: 0 | 1;
}

/** What the player is doing this frame, from the webcam, the keyboard or both. */
export interface CombatInput {
  /** Defenses player 0 is holding. */
  readonly held: ReadonlySet<string>;
  readonly struck: readonly Strike[];
}

export type CombatEvent =
  | { readonly type: "telegraph"; readonly attack: EnemyAttack }
  | { readonly type: "defended"; readonly attack: EnemyAttack }
  | { readonly type: "playerHit"; readonly attack: EnemyAttack; readonly damage: number }
  | { readonly type: "opening"; readonly weakSpot: WeakSpot; readonly move: string }
  | { readonly type: "enemyHit"; readonly move: string; readonly damage: number; readonly quality: number }
  | { readonly type: "phaseChanged"; readonly index: number; readonly name: string }
  | { readonly type: "finished"; readonly move: string }
  | { readonly type: "powerUnleashed"; readonly damage: number }
  | { readonly type: "whiffed" }
  | { readonly type: "won" }
  | { readonly type: "lost" };

/** What a monster's 3D model is told each frame. */
export interface MonsterProps {
  /** 0..1 through the current attack's warning; 0 when not attacking. */
  readonly windup: number;
  readonly attackId: string | null;
  readonly weakSpotId: string | null;
  readonly defeated: boolean;
  /** Index of the enemy's current phase, so the model can change its look. */
  readonly phaseIndex: number;
  /** 1 right after a hit lands, fading to 0. */
  readonly hitFlash: number;
}
