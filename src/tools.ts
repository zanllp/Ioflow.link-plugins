import { createHash } from 'crypto';
import { promises as fs } from 'fs';
export const runtimeCheck = (value: any, message?: string, errorType: new (_?: string) => Error = Error) => {
    if (!value) {
        throw new errorType(message);
    }
};

/**
 * 异步等待对象的生成，对象生成完成返回生成的对象
 * @param getter 对象的获取函数
 * @param checkSize 检查粒度，ms
 * @param timeout 超时时间, ms,-1无限
 */
export const asyncCheck = async<T>(getter: () => T, checkSize = 100, timeout = 1000) => {
    return new Promise<T>(x => {
        const check = (num = 0) => {
            const target = getter();
            if (target !== undefined && target !== null) {
                x(target);
            } else if (num > timeout / checkSize && timeout !== -1) {// 超时
                x(target);
            } else {
                setTimeout(() => check(num + 1), checkSize);
            }
        };
        check();
    });
};

/**
 * 调用old的构造器，生成一个新的对象，并浅层复制old的所有属性
 * @param old 被复制对象
 */
export const createNew = <T>(old: T): T => {
    const newObj = new (old as any).constructor();
    for (const key in old) {
        if (newObj.hasOwnProperty(key)) {
            newObj[key] = old[key];
        }
    }
    return newObj;
};

/**
 * 调用constructor生成一个新的对象，复制obj内与obj共有的属性,只能处理浅层的对象，如果date这种要单独特化
 * @param constructor 继承对象生成的函数，例()=>new User()
 * @param obj 被继承的对象
 */
export const inherit = <T>(constructor: new () => T, obj: any): T => {
    const target = new constructor();
    for (const key in target) {
        if (obj.hasOwnProperty(key)) {
            if (target[key] instanceof Date) { // 如果直接赋值就成字符串了
                target[key] = (new Date(obj[key])) as any;
            } else {
                target[key] = obj[key];
            }
        }
    }
    return target;
};

export const sha256Hash = (buf: Buffer | string) => {
    const hash = createHash('sha256');
    hash.update(buf);
    return hash.digest('hex');
};

/**
 * 随机大小写数字的字符串
 * @param len 目标字符串长度
 */
export const randString = (len: number) => {
    let str = '';
    while (str.length !== len) {
        let rand = Math.floor(Math.random() * 74) + 48;
        if (rand > 57 && rand < 65) {
            rand += 8;
        } else if (rand > 90 && rand < 97) {
            rand += 7;
        }
        str += String.fromCharCode(rand);
    }
    return str;
};

export const isDev = process.env.NODE_ENV === 'development';

/**
 * 将响应序列化成json，随便检测是否包含errmsg，如果有直接抛出
 * @param resp fetch 后的响应
 */
export const checkJson = async <T = any>(resp: any) => {
    const respj = await resp.json();
    runtimeCheck(!respj.errmsg, respj.errmsg);
    return respj as T;
};

export const log = (...x: any[]) => console.info(...x);

export const tryAccessDir = async (path: string) => {
    try {
        await fs.access(path);
    } catch (error) {
        await fs.mkdir(path);
    }
};
/*
async function getPartInfo(x: IGraph, plu: PluginRepo) {
    let code: string;
    let name: string;
    if (x.script) { // 使用修改过组件
        code = x.script;
        name = (plu ? plu.name : '临时组件') + ' - custom';
    }
    else if (x.repositoryId === undefined) { // 使用修改过组件
        code = '';
        name = '临时组件';
    }
    else { // 使用修改过组件
        code = await (await fetch(plu.url as string)).text();
        name = plu.name;
    }
    return { code, name:'' };
}
*/

/*
* 防抖
* @param func 被包装函数
* @param delay 延时，默认 300ms
*/
export const debounce = (func: (...args: any[]) => any, delay: number = 100) => {
   let interval = -1;
   return (...args: any[]) => {
       if (interval !== -1) {
           clearInterval(interval);
       }
       interval = setTimeout(() => func(...args), delay) as any;
   };
};
