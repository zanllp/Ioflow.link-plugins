import * as fs from 'fs';
import fetch from 'node-fetch';
import Socket from 'socket.io';
import { JSON_HEADER, loginCert } from '.';
import { tryAccessDir } from './tools';
import { IRepoType } from './pluginInfo';
import { sync } from './sync';
import { JSDOM } from 'jsdom';
const fsp = fs.promises;
interface IComponent {
    eleId: string;
    type: 'input' | 'ouput' | 'middleware';
    name: string;
    script?: string;
    ts?: string;
    repositoryId?: number;
}
const spector = '/-separator-/';
let importDeclear: undefined | string = undefined;
const dom = new JSDOM();
const { window } = dom;
const { document, XMLSerializer, DOMParser } = dom.window;
const parse = new DOMParser();
const getPrueTs = async (tsfileName: string) => {
    const code = await fsp.readFile(tsfileName);
    const src = code.toString();
    const ts = src.split(spector)[1].trim(); // 删除掉第一行的声明导入
    return { ts, src };
}
export const watch = async (info: IRepoType, p = 2363) => {
    await sync(info);
    const io = Socket(p);
    console.info(`监听端口${p},等待连接`);
    io.on('connect', s => {
        const { account, csrf, cookie } = s.handshake.query;
        const baseName = 'operation-component';
        let tsfileName = undefined as undefined | string;
        let htmlFileName = undefined as undefined | string;
        s.on('disconnect', async () => {
            console.log(`账号${account}已断开连接`);
            if (htmlFileName) {
                fs.unwatchFile(htmlFileName);
                htmlFileName = undefined;
            }
            if (tsfileName) { // 操作的文件名不是未定义说明起码操作过一个文件
                fs.unwatchFile(tsfileName)
                const dir = await fsp.readdir(baseName, { withFileTypes: true });
                await Promise.all(dir.map(x => fsp.unlink(`${baseName}/${x.name}`)));// 断开连接后删除这个文件夹
                await fsp.rmdir(baseName);
            }
        })
        s.on(baseName, async (comp: IComponent) => {
            await tryAccessDir(baseName);
            if (tsfileName) {
                // 取消监听上一个操作的文件，不然在断开连接只会取消最后一次监听的文件且会删除所有文件
                // 导致监听到一个不存在的文件抛出异常
                fs.unwatchFile(tsfileName);
            }
            if (htmlFileName) {
                fs.unwatchFile(htmlFileName);
                htmlFileName = undefined;
            }
            tsfileName = `${baseName}/${comp.name}.ts`;
            const declearFileName = `${baseName}/declear.ts`;
            console.log(`组件:${comp.name}已选择作为操作组件，使用编辑器打开[${tsfileName}]进行编辑`)
            if (!fs.existsSync(declearFileName)) { // 检查声明文件是否存在，不存在和前端获取
                s.emit('ts-declear');
                await new Promise(x => s.on('ts-declear-return', (impotantTS: string, delcearTS: string) => {
                    importDeclear = impotantTS;
                    fs.writeFileSync(declearFileName, delcearTS);
                    x();
                }))
            }
            const addDeclear = (src?: string) => importDeclear + spector + '\r' + src;
            if (comp.type === 'middleware' && comp.repositoryId === undefined) { // 中间件没有远程直接写js,ts就行
                const text = addDeclear(comp.ts || comp.script);//ts||script 有ts就写入ts，没有js
                await fsp.writeFile(tsfileName, text);
                fs.watchFile(tsfileName, {}, async () => { // 等待操作的文件发生改变
                    console.info('文件改变开始重新生成');
                    const { ts, src } = await getPrueTs(tsfileName!);
                    if (ts === undefined) {
                        throw new Error(`分割错误:${src}`);
                    }
                    const js = await ts2js(ts); // ts转es5的js
                    s.emit('code-change', ts, js);
                });
            } else {
                htmlFileName = `${baseName}/${comp.name}.html`;
                let html: string;
                if (comp.script) {
                    html = comp.script;
                    fs.writeFileSync(htmlFileName, html);
                } else {
                    const target = info.local.find(x => x.id === comp.repositoryId)!;
                    fs.copyFileSync(target.path, htmlFileName);
                    html = fs.readFileSync(target.path).toString();
                }
                const doc = parse.parseFromString(html, 'text/html');
                let tsDom = doc.querySelector('#edit-ts');
                if (tsDom === null) { // 如果不存在保存ts代码的dom
                    tsDom = doc.createElement('script'); // 找js的dom
                    tsDom.id = 'edit-ts';
                    tsDom.setAttribute('type', 'typescript');
                    const jsDom = doc.querySelector('script')!;
                    jsDom.id = 'run-js';
                    tsDom.innerHTML = jsDom.innerHTML!;
                    doc.body.appendChild(tsDom);
                    fs.writeFileSync(htmlFileName, doc.body.innerHTML); // 重写
                }
                fs.writeFileSync(tsfileName, addDeclear(tsDom.innerHTML));
                fs.watchFile(tsfileName, async () => {
                    console.info('ts文件改变开始重新编译，并插入到对于html文件');
                    const { ts, src } = await getPrueTs(tsfileName!);
                    if (ts === undefined) {
                        throw new Error(`分割错误:${src}`);
                    }
                    const js = await ts2js(ts); // ts转es5的js
                    doc.querySelector('#edit-ts')!.innerHTML = ts;
                    doc.querySelector('#run-js')!.innerHTML = js;
                    fs.writeFileSync(htmlFileName!, doc.body.innerHTML); // 重写
                })
                fs.watchFile(htmlFileName, () => {
                    const html = fs.readFileSync(htmlFileName!).toString();
                    s.emit('code-change', html);
                    console.info('html文件上传');
                })
            }
        })
        loginCert.cookieSrc = cookie;
        loginCert.csrfSrc = csrf;
        console.log(`账号${account}已连接`);
    });
};

const ts2js = async (ts: string) => {
    const res = await fetch('http://127.0.0.1:7001/tsc', {
        method: 'POST',
        headers: {
            ...JSON_HEADER,
        },
        body: JSON.stringify({ ts, encode: true })
    })
    const text = await res.text();
    const { js } = JSON.parse(text);
    const jsNormal = decodeURIComponent(js);
    // console.info(text, js, jsNormal)
    return jsNormal;
}