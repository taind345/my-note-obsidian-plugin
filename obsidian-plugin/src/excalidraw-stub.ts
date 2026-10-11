import * as React from 'react'

/** Stub thay engine Excalidraw trong plugin Obsidian (không ship 1MB+ engine). */
export function Excalidraw() {
  return React.createElement(
    'div',
    { style: { padding: 16, color: '#64748b' } },
    'Excalidraw engine không khả dụng trong plugin Obsidian.'
  )
}

export type ExcalidrawImperativeAPI = unknown

export default { Excalidraw }
