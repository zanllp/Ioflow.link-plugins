import { localInfo, IRepoType, remoteInfo } from './pluginInfo';
import { sync } from './sync';
import { reset } from './reset';

export const DEV = false;
export const BACKEND_BASE = DEV ? 'http://127.0.0.1:7001' : 'https://api.ioflow.link';
export const CSRF = DEV ? 'rd6MjdiILDJ7hSW4feK8vQiC' : '4geAWWPd_k1v33qR2jChg';
export const CSRF_HEADER = { 'x-csrf-token': CSRF };
export const JSON_HEADER = { 'content-type': 'application/json' };
export const PLUGIN_DIR = './plugin';
export const COOKIE = DEV
    ? { Cookie: 'token=G6SvgfsqFCZvB7JJUtTlCdevSh4HDu4XQXO3gXB3TxBlBgYIgD5eGCWt8c3EtjHr; token.sig=TvCg_5L3mkhadCbPUbBTjLCzLHEbSLk0DznlPyQvXAQ; csrfToken=rd6MjdiILDJ7hSW4feK8vQiC' }
    : { Cookie: 'csrfToken=4geAWWPd_keGSxUjZfH7ZHcsdQNfVZIobtbcU6V3d9ZDAjTg8WbU0o4y7ZIRPYG; token.sig=Mo-mdhgyRJ1wNapV2TYmtzNecI1piRwNDEExuLUAhH8; io=51Ky5k7bHMR2U2DAAAAL' };

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
