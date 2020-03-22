import { localInfo, IRepoType, remoteInfo } from './pluginInfo';
import { sync } from './sync';
import { reset } from './reset';
import { CSRF } from './config';

export const DEV = false;
export const BACKEND_BASE = DEV ? 'http://127.0.0.1:7001' : 'https://api.ioflow.link';
export const CSRF_HEADER = { 'x-csrf-token': CSRF };
export const JSON_HEADER = { 'content-type': 'application/json' };
export const PLUGIN_DIR = './plugin';

const run = async () => {
    const local = await localInfo();
    const remote = await remoteInfo();
    const info: IRepoType = { local, remote };
    const { argv } = process;
    if (argv.length > 2) {
        const type = argv[2].substr(1);
        switch (type) {
            case 'reset':
                await reset(info);
                return; // 只执行一次任务
            case 'sync':
                await sync(info);
                return;
            default:
                throw new Error(`输入参数 ${type} 错误`);
        }
    } else {
        console.info('-sync     同步仓库');
        console.info('-reset-id 重置本地仓库的组件id');
    }
};
Promise.resolve().then(run).catch(x => console.error(x));
