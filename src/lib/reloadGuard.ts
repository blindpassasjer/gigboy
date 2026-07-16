let activeCount = 0
const waiters: Array<() => void> = []

/** Call while an operation that must not be interrupted by a reload is in progress (e.g. audio recording). Call the returned function when it's done. */
export function markReloadUnsafe(): () => void {
  activeCount++
  let released = false
  return () => {
    if (released) return
    released = true
    activeCount = Math.max(0, activeCount - 1)
    if (activeCount === 0) {
      const toRun = waiters.splice(0)
      toRun.forEach((fn) => fn())
    }
  }
}

/** Runs `reload` now if nothing is marked unsafe, otherwise once the last unsafe operation finishes. */
export function reloadWhenSafe(reload: () => void): void {
  if (activeCount === 0) {
    reload()
  } else {
    waiters.push(reload)
  }
}
