// Time comes from one injectable place, so tests can move it forward instead of waiting a day.
export const CLOCK = Symbol('CLOCK');

export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
