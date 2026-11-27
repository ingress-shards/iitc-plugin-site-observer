/**
 * Bridges Vitest 5's fake `globalThis.Temporal` to `temporal-polyfill/fns/Now`.
 *
 * `temporal-polyfill` caches `const NativeTemporal = globalThis.Temporal` at module load,
 * while `@sinonjs/fake-timers` replaces `globalThis.Temporal` with a new object on
 * `vi.useFakeTimers()`. Wrapping the clock methods on `NativeTemporal.Now` in place
 * forwards calls to the active `globalThis.Temporal.Now` whenever fake timers swap it.
 *
 * Note: `timeZoneId` is intentionally excluded because Sinon's fake `Temporal.Now`
 * delegates `timeZoneId()` back to `NativeTemporal.Now.timeZoneId()`.
 */
type TemporalNowMethod =
    | "instant"
    | "zonedDateTimeISO"
    | "plainDateTimeISO"
    | "plainDateISO"
    | "plainTimeISO";

type TemporalNowObject = Record<TemporalNowMethod, (...args: unknown[]) => unknown> & {
    [PATCHED]?: boolean;
};

interface TemporalGlobal {
    Temporal?: {
        Now?: TemporalNowObject;
    };
}

const PATCHED = Symbol.for("site-observer.temporal-now-forwarder");
const CLOCK_METHODS: readonly TemporalNowMethod[] = [
    "instant",
    "zonedDateTimeISO",
    "plainDateTimeISO",
    "plainDateISO",
    "plainTimeISO",
];

const globalWithTemporal = globalThis as unknown as TemporalGlobal;
const nativeTemporal = globalWithTemporal.Temporal;
const nativeNow = nativeTemporal?.Now;

if (nativeTemporal && nativeNow && !nativeNow[PATCHED]) {
    nativeNow[PATCHED] = true;

    for (const method of CLOCK_METHODS) {
        const original = nativeNow[method];
        if (typeof original !== "function") continue;

        nativeNow[method] = (...args: unknown[]) => {
            const currentTemporal = globalWithTemporal.Temporal;
            if (currentTemporal && currentTemporal !== nativeTemporal && currentTemporal.Now) {
                return currentTemporal.Now[method](...args);
            }
            return original.apply(nativeNow, args);
        };
    }
}
