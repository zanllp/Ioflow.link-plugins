import Socket from 'socket.io';
import { IRepoType, localInfo, remoteInfo } from './pluginInfo';
import { reset } from './reset';
import { sync } from './sync';

export const DEV = false;
export const BACKEND_BASE = DEV ? 'http://127.0.0.1:7001' : 'https://api.ioflow.link';
export const JSON_HEADER = { 'content-type': 'application/json' };
export const PLUGIN_DIR = './plugin';
export const loginCert = {
    get csrf() {
        return {
            'x-csrf-token': this.csrfSrc,
        };
    },
    get cookie() {
        return {
            Cookie: this.cookieSrc,
        };
    },
    csrfSrc: '',
    cookieSrc: '',
};

const watch = async (p = 2363) => {
    const io = Socket(p);
    console.info(`监听端口${p},等待连接`);
    io.on('connect', s => {
        const { account, csrf, cookie } = s.handshake.query;
        loginCert.cookieSrc = cookie;
        loginCert.csrfSrc = csrf;
        console.log(`账号${account}已连接`);
    });

};

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
            case 'watch':
                await watch();
                return;
            default:
                throw new Error(`输入参数 ${type} 错误`);
        }
    } else {
        console.info('-sync     同步仓库');
        console.info('-reset-id 重置本地仓库的组件id');
        console.info('-create-new 创建新的组件，并进入观察模式 --ts 使用ts写');
        console.info('-watch 创建新的组件，并进入观察模式 --p 端口');
    }
};
Promise.resolve().then(run).catch(x => console.error(x));
