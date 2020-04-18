import { getRepoInfo } from '.';
import { Plugin } from './plugin';
import { promises as fs } from 'fs';

export const reset = async () => {
    const { local } = await getRepoInfo();
    await Promise.all(local.map(async x => {
        const buf = await fs.readFile(x.path);
        const pluginInfo = Plugin.modifyProfile(buf, { id: -1 });
        await fs.writeFile(x.path, pluginInfo.buf);
    }));
};
