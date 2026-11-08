// The run's choreography, in seconds on the run's clock (0 is the press of
// Start). The scene and the interface both read these, so a throw, its
// number and the instruments stay on one beat.

/** Start's exit: it swells to START_SWELL over START_SWELL_T, then collapses on its own centre to nothing at START_GONE, thinning over its last START_THIN. */
export const START_SWELL = 1.07;
export const START_SWELL_T = 0.16;
export const START_GONE = 0.4;
export const START_THIN = 0.08;
/** Start's shockwave leaves its rim at BLAST_AT and runs out past the farthest corner over BLAST_DUR, carrying the idle pieces off; stragglers fade over CLEAR_FADE so the screen is clear by CLEAR. */
export const BLAST_AT = START_SWELL_T;
export const BLAST_DUR = 1.5;
export const CLEAR_FADE = 0.25;
export const CLEAR = 1.15;

/**
 * Ping is four throws of one boomerang, the first leaving at PING_AT, once
 * the screen is clear, one every TRIP seconds, each back after FLY. The
 * probes themselves take a fraction of that; the throws show them at a pace
 * the eye can follow.
 */
export const THROWS = 4;
export const PING_AT = CLEAR + 0.1;
export const TRIP = 0.7;
export const FLY = 0.55;

/**
 * The beats between phases: after the last catch, download waits
 * LAND_PING; after download, upload waits LAND_DL; after upload the result
 * forms LAND_UL later. The measurement waits with them, so no transfer runs
 * unseen.
 */
export const LAND_PING = 1.5;
export const LAND_DL = 1.6;
export const LAND_UL = 1.6;

/** The live number eases onto a direction's result over SETTLE once its phase ends. */
export const SETTLE = 0.5;
/** Seconds the live number takes to glide onto the result's upload line. */
export const RES_MOVE = 1.4;
/** New test back to idle. */
export const EXIT_END = 0.75;

/** A phase change rolls the eye's words over ROLL_PHASE, a unit change over ROLL; a catch lifts the old reading over CATCH_LEAD and settles the new one over CATCH_SETTLE. */
export const ROLL_PHASE = 1.2;
export const ROLL = 0.55;
export const CATCH_LEAD = 0.1;
export const CATCH_SETTLE = 0.3;
