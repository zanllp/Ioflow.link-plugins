import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import * as Path from 'path';
import { IProfile, Plugin } from './plugin';
import { sha256Hash, runtimeCheck } from './tools';

export const DEV = true;
export const BACKEND_BASE = DEV ? 'http://127.0.0.1:7001' : 'https://api.ioflow.link';
export const CSRF = 'rd6MjdiILDJ7hSW4feK8vQiC';
export const CSRF_HEADER = { 'x-csrf-token': CSRF };
export const JSON_HEADER = { 'content-type': 'application/json' };
export const PLUGIN_DIR = './plugin';
export const COOKIE = { Cookie: 'token=G6SvgfsqFCZvB7JJUtTlCdevSh4HDu4XQXO3gXB3TxBlBgYIgD5eGCWt8c3EtjHr; token.sig=TvCg_5L3mkhadCbPUbBTjLCzLHEbSLk0DznlPyQvXAQ; csrfToken=rd6MjdiILDJ7hSW4feK8vQiC' };
export const MULTIPART = { 'Content-Type': 'multipart/form-data' };

interface IRepoType {
    local: Array<IProfile & { path: string }>;
    remote: Array<Plugin>;
}

const localInfo = async () => {
    const localPlugins = await fs.readdir(PLUGIN_DIR, { withFileTypes: true });
    const noExistProfile = new Array<string>();
    const localPluginInfo = await Promise.all(localPlugins.map(async x => {
        if (!x.isFile()) {
            return;
        }
        const path = Path.resolve(PLUGIN_DIR, x.name);
        const buf = await fs.readFile(path);
        const bufStr = buf.toString();
        const include = Plugin.includeProfile(bufStr);
        if (include) {
            const plugin = Plugin.modifyProfile(buf);
            await fs.writeFile(path, plugin.buf);
            return { ...plugin.info, path };
        } else {
            noExistProfile.push(x.name);
        }
    }));
    if (noExistProfile.length !== 0) {
        let msg = '下列文件不存在profile，已插入空模板，在写好后尝试重新运行。\n';
        await Promise.all(noExistProfile.map(async x => {
            msg += `    --${x}\n`;
            const path = Path.resolve(PLUGIN_DIR, x);
            const buf = await fs.readFile(path);
            const bufNew = Plugin.insertProfile(buf, {
                name: '插件名<string>',
                desc: '插件描述<string>',
                type: '插件类型<input|output>',
                hash: sha256Hash(buf), // hash只算下面那部分就行
                id: -1, // id和hash都不要去动
            });
            await fs.writeFile(path, bufNew);
        }));
        throw new Error(msg);
    }
    return localPluginInfo.filter(x => x);
};

const remoteInfo = (): Promise<Array<Plugin>> =>
    fetch(BACKEND_BASE + '/plugin')
        .then(x => x.json())
        .then(x => x.plugins.map(Plugin.inherit));

const created = async (info: IRepoType) => {
    const { local } = info;
    log('本地仓库新增:');
    const newCreate = local.filter(x => x.id === -1);
    newCreate.forEach(x => log(`    --${x.path}`));
    // 提交新增组件代码
    await Promise.all(newCreate.map(async x => {
        const buf = await fs.readFile(x.path);
        const bufStr = buf.toString();
        await Plugin.add({
            code: bufStr,
            ...Plugin.getProfile(bufStr),
        });
    }));
    const remote = await remoteInfo();
    // 修改本地新增组件profile的id
    await Promise.all(newCreate.map(async x => {
        const targetRemote = remote.find(y => y.hash + y.name === x.hash + x.name);
        runtimeCheck(targetRemote, '找不到远程中对应的新增组件信息');
        const buf = await fs.readFile(x.path);
        const newBuf = Plugin.modifyProfile(buf, {
            id: targetRemote.id,
        }).buf;
        await fs.writeFile(x.path, newBuf);
    }));
};

const diff = async (info: IRepoType) => {
    const { local, remote } = info;
    log('本地，远程仓库不一致:');
    const codeModify = local.filter(x => {
        const target = remote.find(y => y.id === x.id);
        return target && target.hash !== x.hash;
    });
    const profileModify = local.filter(x => {
        const target = remote.find(y => y.id === x.id);
        const profile2str = (desc: string, type: string, name: string) => JSON.stringify({desc, type, name});
        return target && profile2str(x.desc, x.type, x.name) !== profile2str(target.desc, target.type, target.name);
    });
    profileModify.forEach(x => log(`   --profile--${x.path}`));
    codeModify.forEach(x => log(`   --code--${x.path}`));
    await Promise.all(profileModify.map(async x => {
        const buf = await fs.readFile(x.path);
        const bufStr = buf.toString();
        await Plugin.update({
            ...Plugin.getProfile(bufStr),
        });
    }));
    // 目前只是一個人用所以不存在衝突的情況
    await Promise.all(codeModify.map(async x => {
        const buf = await fs.readFile(x.path);
        const bufStr = buf.toString();
        await Plugin.update({
            code: bufStr,
            ...Plugin.getProfile(bufStr),
        });
    }));
};

const lack = async (info: IRepoType) => {
    const { remote } = info;
    log('本地仓库缺失:');
    const lackPlugin = remote.filter(x => !remote.find(y => y.id === x.id));
    await Promise.all(lackPlugin.map(async x => {
        log(` --${x.name}`);
        const plugin = await fetch(x.url).then(y => y.text());
        await fs.writeFile(PLUGIN_DIR + `/${x.name}.html`, Buffer.from(plugin));
    }));
};

const deleted = async (info: IRepoType) => {
    const { local, remote } = info;
    log('远程仓库已删除:');
    const deletedPlugin = local.filter(x => x.id !== -1).filter(x => !remote.find(y => y.id === x.id));
    await Promise.all(deletedPlugin.map(async x => {
        log(`   --${x.path}`);
        const newPath = Path.resolve(PLUGIN_DIR, './deleted', Path.parse(x.path).name + '.html');
        await fs.rename(x.path, newPath);
    }));
};

const log = (...x: any[]) => console.info(...x);

const run = async () => {
    const local = await localInfo();
    const remote = await remoteInfo();
    const info: IRepoType = { local, remote };
    await created(info);
    await diff(info);
    await lack(info);
    await deleted(info);
};
Promise.resolve().then(run).catch(x => console.error(x));
// localInfo().catch(x => console.error(x));
// remoteInfo().then(x => x.forEach(_ => console.info(_))).catch(x => console.error(x));
