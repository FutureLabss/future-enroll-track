import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Heavy libraries — always split first so they don't bloat page chunks
          if (id.includes('node_modules/xlsx')) return 'lib-xlsx';
          if (id.includes('node_modules/recharts')) return 'lib-recharts';
          if (id.includes('node_modules/framer-motion')) return 'lib-framer';
          // Group pages by section: one chunk per role means navigating within a
          // section never triggers a new network round-trip after the first load
          if (id.includes('/pages/admin/')) return 'pages-admin';
          if (id.includes('/pages/staff/')) return 'pages-staff';
          if (id.includes('/pages/student/')) return 'pages-student';
          if (id.includes('/pages/org/')) return 'pages-org';
          if (id.includes('/pages/auth/')) return 'pages-auth';
          if (id.includes('/pages/public/')) return 'pages-public';
          if (id.includes('/pages/')) return 'pages-shared';
        },
      },
    },
  },
}));
