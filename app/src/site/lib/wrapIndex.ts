export function wrapIndex(i: number, len: number) {
  if (len <= 0) return 0
  return ((i % len) + len) % len
}
