import { ObserverEventInput } from "../types/ObserverEvents";

export interface IntelObserver<T> {
    observe(input: ObserverEventInput<T>): void;
}
