import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import * as Path from 'path';
import { BACKEND_BASE, PLUGIN_DIR } from '.';
import { IProfile, Plugin } from './plugin';
import { sha256Hash, tryAccessDir } from './tools';
export interface IRepoType {
    local: Array<IProfile & { path: string }>;
    remote: Array<Plugin>;
}

export const localInfo = async () => {
    await tryAccessDir(PLUGIN_DIR);
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

export const remoteInfo = (): Promise<Array<Plugin>> =>
    fetch(BACKEND_BASE + '/plugin')
        .then(x => x.json())
        .then(x => x.plugins.map(Plugin.inherit));
