import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import { IOCType, Plugin, IAdd } from './plugin';
import * as Path from 'path';
import { sha256Hash } from './tools';

export const DEV = true;
export const BACKEND_BASE = DEV ? 'http://127.0.0.1:7001' : 'https://api.ioflow.link';
export const ADMIN_TOKEN = '';
export const CSRF = '';
export const CSRF_HEADER = { 'x-csrf-token': CSRF };
export const JSON_HEADER = { 'content-type': 'application/json' };
export const PLUGIN_DIR = './plugin';

const localInfo = async () => {
    const localPlugins = await fs.readdir(PLUGIN_DIR);
    const noExistProfile = new Array<string>();
    const localPluginInfo = await Promise.all(localPlugins.map(async x => {
        const path = Path.resolve(PLUGIN_DIR, x);
        const buf = await fs.readFile(path);
        const bufStr = buf.toString();
        const include = Plugin.includeProfile(bufStr);
        if (include) {
            const plugin = Plugin.modifyProfile(buf);
            await fs.writeFile(path, plugin.buf);
            return plugin.info;
        } else {
            noExistProfile.push(x);
        }
    }));
    if (noExistProfile.length !== 0) {
        let msg = '下列文件不存在profile，已插入空模板，在写好后尝试重新运行。\n';
        await Promise.all(noExistProfile.map(async x => {
            msg += `    --${x}\n`;
            const path = Path.resolve(PLUGIN_DIR, x);
            const buf = await fs.readFile(path);
            const bufNew = Plugin.insertProfile(buf, {
                name: '插件名',
                desc: '插件描述',
                type: '插件类型<input|output>',
                hash: sha256Hash(buf), // hash只算下面那部分就行
                id: -1,
            });
            await fs.writeFile(path, bufNew);
        }));
        throw new Error(msg);
    }
    return localPluginInfo;
};

const remoteInfo = async () => {
    // 远程仓库的插件情况
    const repo = await fetch(BACKEND_BASE + '/plugin')
        .then(x => x.json())
        .then(x => x.plugins.map(Plugin.inherit)) as Plugin[];
    return repo;
};

const log = (x: string) => console.time(x);
/*const run = async () => {
    const local = await localInfo();
    const remote = await remoteInfo();
    const newCreate = local.filter(x => x.id === -1);
    log('新增:');
    newCreate.forEach(x => log(`-- ${x.path}`));
    const modify = local.filter(x => {
        const target = remote.find(y => y.id === x.id);
        return target && target.hash !== x.hash;
    });
    log('修改:');
    modify.forEach(x => log(`-- ${x.path}`));
    const lack = remote.filter(x => !remote.find(y => y.id === x.id));
    log('缺失:');
    lack.forEach(x => log(`-- ${x.name}`));

};*/
// Promise.resolve().then(localInfo);
localInfo().catch(x => console.error(x));
remoteInfo().then(x => x.forEach(_ => console.info(_))).catch(x => console.error(x));