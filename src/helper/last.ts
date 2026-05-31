export const last = <T>(list: ArrayLike<T>): T =>
  list.length >= 1 ? list[list.length - 1] : undefined;
