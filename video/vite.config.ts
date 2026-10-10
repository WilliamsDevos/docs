import {defineConfig} from 'vite';

export default defineConfig({
  // Sin recarga en caliente durante un render: un archivo guardado no debe recargar la página.
  server: {hmr: process.env.VIDEO_NO_HMR ? false : undefined},
});
