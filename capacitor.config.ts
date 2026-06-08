import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.winmorsoft.app',
  appName: 'WinMor Soft',
  webDir: 'public',
  server: {
    url: 'https://thbmanila.vercel.app',
    cleartext: true
  }
};

export default config;
