import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' file: mdlocal: data: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join("; ");

function injectCsp(): Plugin {
  return {
    name: "mdmaster-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        '<head>\n    <meta http-equiv="Content-Security-Policy" content="' + CSP + '" />'
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), injectCsp()],
  server: { port: 5199, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
