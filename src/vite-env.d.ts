/// <reference types="vite/client" />

// This font package's export map adds ".css" itself, so it is imported without it.
declare module '@fontsource/big-shoulders-display/*';

declare module 'virtual:asset-manifest' {
  /** Image files under public/assets, e.g. "assets/champions/Shen.png". */
  const files: string[];
  export default files;
}
