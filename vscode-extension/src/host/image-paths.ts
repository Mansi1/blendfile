// Where an image a .blend file names may be on disk. No vscode import, so unit tests run it without VS Code.

/** Image file types the webview can decode; other files are never read on a .blend file's behalf. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "exr", "webp", "bmp", "gif"]);

/**
 * Candidate paths, most likely first, for Image.filepath as Blender saved it, given the .blend file's folder (POSIX path).
 * "//" is relative to the .blend file; absolute paths from another machine rarely exist, so the file name is also tried
 * next to the .blend file and in its "textures" folder. Returns [] for files that are not images.
 */
export function imagePathCandidates(blendFolder: string, filepath: string): string[] {
  const normalized = filepath.replace(/\\/g, "/");
  const fileName = normalized.slice(normalized.lastIndexOf("/") + 1);
  const extension = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  if (fileName === "" || !fileName.includes(".") || !IMAGE_EXTENSIONS.has(extension)) return [];
  const folder = blendFolder.replace(/\/+$/, "");
  const candidates: string[] = [];
  if (normalized.startsWith("//")) candidates.push(`${folder}/${normalized.slice(2)}`);
  else if (normalized.startsWith("/")) candidates.push(normalized);
  else if (/^[A-Za-z]:\//.test(normalized)) candidates.push(`/${normalized}`);
  else candidates.push(`${folder}/${normalized}`);
  candidates.push(`${folder}/${fileName}`, `${folder}/textures/${fileName}`);
  return [...new Set(candidates.map(collapseDotSegments))];
}

/** Resolves "." and ".." segments, e.g. "/a/b/../c" → "/a/c". */
function collapseDotSegments(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") {
      if (segments.length > 1) segments.pop();
    } else if (segment !== ".") segments.push(segment);
  }
  return segments.join("/").replace(/\/{2,}/g, "/");
}
