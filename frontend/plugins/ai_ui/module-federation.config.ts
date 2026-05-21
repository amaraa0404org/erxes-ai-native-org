// Phase 1.1 MF surface is FINAL — Phases 1.4/2.3/3.2 fill the placeholder modules, NOT this config.
// The `coreLibraries` Set + `shared` callback below are a VERBATIM mirror of
// frontend/plugins/sales_ui/module-federation.config.ts:3-13 per CONTEXT D-08 / REQ HOOK-02.
// NO strict-version flag per PITFALLS §P11 — singleton + requiredVersion from defaultConfig only.
import { ModuleFederationConfig } from '@nx/rspack/module-federation';

const coreLibraries = new Set([
  'react',
  'react-dom',
  'react-router',
  'react-router-dom',
  'erxes-ui',
  '@apollo/client',
  'jotai',
  'ui-modules',
  'react-i18next',
]);

const config: ModuleFederationConfig = {
  name: 'ai_ui',
  exposes: {
    './config': './src/config.tsx',
    './aiSettings': './src/modules/settings/AiSettingsIndexPage.tsx',
    './Copilot': './src/Copilot.tsx',
    './atoms': './src/atoms/index.ts',
    './hooks': './src/hooks/index.ts',
    './widgets': './src/widgets/index.ts',
  },

  shared: (libraryName, defaultConfig) => {
    if (coreLibraries.has(libraryName)) {
      return defaultConfig;
    }

    // Returning false means the library is not shared.
    return false;
  },
};
/**
 * Nx requires a default export of the config to allow correct resolution of the module federation graph.
 **/
export default config;
