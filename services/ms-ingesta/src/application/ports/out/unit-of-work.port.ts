export interface UnitOfWorkPort {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
