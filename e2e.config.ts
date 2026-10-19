import type {E2EConfig} from 'e2e';
import {web} from '@e2e-dev/web';
export default {tests:'tests/**/*.e2e.ts',workers:1,retries:0,timeout:15000,targets:[{name:'chromium',engine:web(),app:{url:'http://127.0.0.1:4188',command:{executable:'node',args:['tests/serve.mjs']}}}]} satisfies E2EConfig;
