/**
 * Generates a bundle containing all client SDK files as a single module
 * that can be served by the API
 */
export function emitSdkBundle(clientFiles: { path: string; content: string }[]) {
  // Extract just the relative paths within the client directory
  const files: Record<string, string> = {};
  
  for (const file of clientFiles) {
    // Get the path relative to the client directory
    const parts = file.path.split('/');
    const clientIndex = parts.lastIndexOf('client');
    if (clientIndex >= 0 && clientIndex < parts.length - 1) {
      const relativePath = parts.slice(clientIndex + 1).join('/');
      files[relativePath] = file.content;
    }
  }
  
  const version = `1.0.0`; // TODO: Could get from config later
  const generated = new Date().toISOString();
  
  return `/* Generated. Do not edit. */

export const SDK_MANIFEST = {
  version: "${version}",
  generated: "${generated}",
  files: ${JSON.stringify(files, null, 2)}
};
`;
}