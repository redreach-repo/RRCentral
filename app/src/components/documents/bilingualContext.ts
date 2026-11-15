import { createContext, useContext } from 'react'

/** True while a document sheet prints labels in English and Arabic. */
export const BilingualContext = createContext(false)

export function useBilingual(): boolean {
  return useContext(BilingualContext)
}
