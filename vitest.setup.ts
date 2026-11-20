import { CLASSIC_TUNING, setTuning } from './packages/shared/src/tuning';

// The rules are tested in plain units: one point of damage, the original experience curve (see tuning.ts).
// The tests of the tuning itself switch to the real numbers and back.
setTuning(CLASSIC_TUNING);
