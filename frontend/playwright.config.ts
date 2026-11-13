import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',
  fullyParallel:true,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:5173',trace:'on-first-retry'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:[
    {command:'npm run dev:backend',url:'http://127.0.0.1:8000/api/health',reuseExistingServer:!process.env.CI,timeout:60_000},
    {command:'npm run dev:frontend',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:60_000}
  ]
});
