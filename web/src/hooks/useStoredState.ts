import { useEffect, useState } from 'react'

export function readStoredValue<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

export function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue))

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}
