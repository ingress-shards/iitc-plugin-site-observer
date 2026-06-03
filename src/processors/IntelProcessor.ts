import { ObserverEventInput } from "../types/ObserverEvents";

export interface IntelProcessor<T> {
    process(input: ObserverEventInput<T>): void;
}
