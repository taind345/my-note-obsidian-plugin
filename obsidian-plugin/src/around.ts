/**
 * Monkey-around utility (pjeby/monkey-around pattern).
 * Safe method interceptor that supports clean unpatching.
 */
export function around<T extends Record<string, any>>(
  obj: T,
  factories: { [K in keyof T]?: (next: T[K]) => T[K] }
): () => void {
  const removers: Array<() => void> = []
  for (const key of Object.keys(factories) as Array<keyof T>) {
    const original = obj[key]
    const factory = factories[key]
    if (typeof factory !== 'function' || typeof original !== 'function') continue
    const wrapper = factory(original)
    obj[key] = wrapper
    removers.push(() => {
      if (obj[key] === wrapper) {
        obj[key] = original
      }
    })
  }
  return () => {
    for (const remove of removers) remove()
  }
}
