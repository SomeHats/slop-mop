const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico"])

// woke2 impl DV-IMG-1
export function isImagePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".")
  if (dot < 0 || dot === filePath.length - 1) return false
  const ext = filePath.slice(dot + 1).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}
