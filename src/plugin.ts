import { BACKEND_BASE, CSRF_HEADER } from '.';
import { checkJson, inherit, runtimeCheck, sha256Hash } from './tools';

export enum IOCType {
    input = 'input',
    output = 'output',
}
export interface IAdd {
    file: FormData;
    code: string;
    name: string;
    type: IOCType;
    desc: string;
    id: number;
}

export interface IProfile {
    type: string;
    hash: string;
    desc: string;
    name: string;
    id: number;
}

export class Plugin {

    public static inherit(plugin: Plugin) {
        return inherit(Plugin, plugin);
    }

    public static includeProfile(src: string) {
        return /^<!--PROFILE_START.*PROFILE_END-->/s.test(src);
    }

    public static getProfile(src: string) {
        const reg = /^<!--PROFILE_START(.*)PROFILE_END-->/s.exec(src);
        runtimeCheck(reg.length === 2, '不存在profile');
        return JSON.parse(reg[1].trim());
    }

    /**
     * 仅用于插入不存在profile的文件
     */
    public static insertProfile(buf: Buffer, obj: IProfile) {
        const profileText =
            `<!--PROFILE_START
${JSON.stringify(obj, null, 4)}
PROFILE_END-->\n`;
        return Buffer.concat([Buffer.from(profileText), buf]);
    }

    public static getBody(src: string) {
        const reg = /PROFILE_END-->([\r\n]*)(.*)$/s.exec(src);
        runtimeCheck(reg && reg.length === 3, '不存在profile');
        return reg[2];
    }

    /**
     * 修改profile
     * @param buf 文件
     * @param obj 新的属性，不需要给全部，会覆盖以前，hash会自己算
     */
    public static modifyProfile(buf: Buffer, obj?: Partial<IProfile>) {
        const bufStr = buf.toString();
        const oldObj = Plugin.getProfile(bufStr);
        const newBuf = Buffer.from(Plugin.getBody(bufStr));
        const info = {
            ...oldObj,
            ...obj,
            hash: sha256Hash(newBuf),
        } as IProfile;
        return { info, buf: Plugin.insertProfile(newBuf, info) };
    }

    public static decodeUrl(uri: string) {
        uri = decodeURIComponent(uri);
        const info = JSON.parse(uri) as { name: string, hash: string, id: number };
        return info;
    }

    public static async addByFormData(add: IAdd) {
        runtimeCheck(add.name.length !== 0, '名字不允许为空');
        runtimeCheck(add.file.has('files[]'), '文件未设置');
        const resp = await fetch(`${BACKEND_BASE}/plugin/addByFile?name=${add.name}&type=${add.type}&desc=${add.desc}`, {
            body: add.file,
            method: 'POST',
            credentials: 'include',
            headers: CSRF_HEADER,
        });
        return checkJson(resp);
    }

    public static async updateByFormData(add: IAdd) {
        runtimeCheck(add.name.length !== 0, '名字不允许为空');
        runtimeCheck(add.file.has('files[]'), '文件未设置');
        const resp = await fetch(`${BACKEND_BASE}/plugin/updateByFile?name=${add.name}&type=${add.type}&desc=${add.desc}&id=${add.id}`, {
            body: add.file,
            method: 'POST',
        });
        return checkJson(resp);
    }

    public id: number = 0;

    /** 组件名称 */
    public name: string = '';

    /** 组件类型 */
    public type: IOCType = IOCType.input;

    /** 仓库链接 */
    public url: string = '';

    /** 图标链接 */
    public iconUrl: string = '';

    /** 组件描述 */
    public desc: string = '';

    /**
     * 创建者
     */
    public creatorId: number = -1;

    /**
     * 创建时间，自动生成
     */
    public createdDate = new Date();

    public updatedDate = new Date();

    public hash: string = '';

}
