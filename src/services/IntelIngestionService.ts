export interface IntelIngestionService<T> {
    ingest(input: T): void | Promise<void>;
}
