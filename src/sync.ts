import { PLUGIN_DIR } from '.';
import { Plugin, IProfile } from './plugin';
import { IRepoType, remoteInfo } from './pluginInfo';
import * as Path from 'path';
import { log, runtimeCheck, tryAccessDir } from './tools';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
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
        const t = remote.find(y => y.id === x.id);
        const a = (_: Plugin | IProfile) => `${_.desc},${_.type},${_.name}`;
        return t && a(x) !== a(t);
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
    const { remote, local } = info;
    log('本地仓库缺失:');
    const lackPlugin = remote.filter(x => !local.find(y => y.id === x.id));
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
    await tryAccessDir('./plugin/deleted');
    await Promise.all(deletedPlugin.map(async x => {
        log(`   --${x.path}`);
        const newPath = Path.resolve(PLUGIN_DIR, './deleted', Path.parse(x.path).name + '.html');
        await fs.rename(x.path, newPath);
    }));
};

export const sync = async (info: IRepoType) => {
    await created(info);
    await diff(info);
    await lack(info);
    await deleted(info);
};
