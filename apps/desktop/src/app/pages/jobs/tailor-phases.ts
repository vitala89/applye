import { JOB_DETAIL_ICONS } from './job-detail-icons';

export type TailorPhaseState = 'done' | 'running' | 'ready' | 'pending';

/** The three passes, in order: draft, critique, rebuild. */
const PHASES = [
  { n: 1, icon: JOB_DETAIL_ICONS.pencilLine, nameKey: 'jobs.wizard.phase_xyz' },
  { n: 2, icon: JOB_DETAIL_ICONS.scanSearch, nameKey: 'jobs.wizard.phase_critique' },
  { n: 3, icon: JOB_DETAIL_ICONS.hammer, nameKey: 'jobs.wizard.phase_build' },
];

/**
 * One pass as the wizard renders it. The icon type is taken from `PHASES`
 * rather than declared: widening it to something the template cannot bind was
 * an error only `nx build desktop` reported, and `npm run type-check` did not.
 */
export type TailorPhase = (typeof PHASES)[number] & {
  state: TailorPhaseState;
  statusKey: string;
};

/** The i18n keys of the three phases, for the "AI thinking" line. */
export const TAILOR_PHASE_KEYS = PHASES.map((p) => p.nameKey);

/**
 * The state of each tailoring pass, from how many have finished and whether one
 * is running.
 *
 * `ready` and `pending` are the distinction worth keeping: only the pass
 * immediately after the last finished one can be started, and calling every
 * later pass `ready` would offer three buttons for a sequence that has to run
 * in order.
 */
export function tailorPhases(done: number, running: boolean): TailorPhase[] {
  return PHASES.map((phase) => {
    if (done >= phase.n) return { ...phase, state: 'done', statusKey: 'jobs.wizard.phase_done' };
    if (done !== phase.n - 1) {
      return { ...phase, state: 'pending', statusKey: 'jobs.wizard.phase_pending' };
    }
    return running
      ? { ...phase, state: 'running', statusKey: 'jobs.wizard.phase_running' }
      : { ...phase, state: 'ready', statusKey: 'jobs.wizard.phase_ready' };
  });
}

/**
 * The pass currently being generated. Clamped to the last one, because the
 * count reaches three the moment the run finishes and there is no fourth phase
 * to name.
 */
export function currentPhaseKey(done: number): string {
  return TAILOR_PHASE_KEYS[Math.min(done, TAILOR_PHASE_KEYS.length - 1)];
}
