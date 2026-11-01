const decodeTable = {
  '-': '+',
  '_': '/',
  '.': '='
}

export function decodeB64Web(safe) {
    let content = safe.replace(/[-_.]/g, (m) => decodeTable[m])
    return content
}