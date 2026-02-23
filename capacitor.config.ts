import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.personall.app',
  appName: 'Personall',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
      stats: true,
    },
  },
};

export default config;
