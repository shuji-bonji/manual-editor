/**
 * 小さな購読できる値。Svelte の store contract（subscribe が今の値をすぐ 1 回渡し、解除の関数を返す）に合わせてあるので、
 * Svelte からは `$flow` のように読める。Svelte には依存しない。
 */
export interface Readable<T> {
  /** 今の値をすぐ 1 回渡し、以後は変わるたびに渡す。戻り値は購読の解除 */
  subscribe(run: (value: T) => void): () => void;
  /** 今の値 */
  get(): T;
}

export interface Writable<T> extends Readable<T> {
  set(value: T): void;
}

export function createStore<T>(initial: T): Writable<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      for (const run of listeners) run(value);
    },
    subscribe(run) {
      listeners.add(run);
      run(value);
      return () => {
        listeners.delete(run);
      };
    }
  };
}
