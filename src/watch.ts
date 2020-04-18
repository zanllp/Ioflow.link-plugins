import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import Socket from 'socket.io';
import { getRepoInfo, JSON_HEADER, loginCert } from '.';
import { sync } from './sync';
import { tryAccessDir } from './tools';
const fsp = fs.promises;
interface IComponent {
    eleId: string;
    type: 'input' | 'ouput' | 'middleware';
    name: string;
    script?: string;
    ts?: string;
    repositoryId?: number;
}
const spector = '//-separator-//';
let importDeclear: undefined | string;
const dom = new JSDOM();
const { DOMParser } = dom.window;
const parse = new DOMParser();
const getPrueTs = async (tsfileName: string) => {
    const code = await fsp.readFile(tsfileName);
    const src = code.toString();
    const ts = src.split(spector)[1].trim(); // 删除掉第一行的声明导入
    return { ts, src };
};
const baseName = 'operation-component';

const addDeclear = (src?: string) => importDeclear + spector + '\r' + src;
export const watch = async (p = 2363) => {
    await sync();
    const io = Socket(p);
    console.info(`监听端口${p},等待连接`);
    io.on('connect', s => {
        const { account, csrf, cookie } = s.handshake.query;
        let tsfileName = undefined as undefined | string;
        let htmlFileName = undefined as undefined | string;
        s.on('disconnect', async () => {
            console.log(`账号${account}已断开连接`);
            if (htmlFileName) {
                fs.unwatchFile(htmlFileName);
                htmlFileName = undefined;
            }
            if (tsfileName) { // 操作的文件名不是未定义说明起码操作过一个文件
                fs.unwatchFile(tsfileName);
                const dir = await fsp.readdir(baseName, { withFileTypes: true });
                await Promise.all(dir.map(x => fsp.unlink(`${baseName}/${x.name}`))); // 断开连接后删除这个文件夹
                await fsp.rmdir(baseName);
            }
        });
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
            console.log(`组件:${comp.name}已选择作为操作组件，使用编辑器打开[${tsfileName}]进行编辑`);
            await checkDeclear(s);
            if (comp.type === 'middleware') { // 中间件没有远程直接写js,ts就行
                await operatrionMiddleware(comp, s, tsfileName);
            } else {
                htmlFileName = `${baseName}/${comp.name}.html`;
                await operationIOComponent(comp, s, tsfileName, htmlFileName);
            }
        });
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
        body: JSON.stringify({ ts, encode: true }),
    });
    const text = await res.text();
    const { js } = JSON.parse(text);
    const jsNormal = decodeURIComponent(js);
    // console.info(text, js, jsNormal)
    return jsNormal;
};

async function checkDeclear(s: Socket.Socket) {
    const declearFileName = `${baseName}/declear.ts`;
    if (!fs.existsSync(declearFileName) || importDeclear === undefined) { // 检查声明文件是否存在，不存在和前端获取
        s.emit('ts-declear');
        await new Promise(x => s.on('ts-declear-return', (impotantTS: string, delcearTS: string) => {
            importDeclear = impotantTS;
            fs.writeFileSync(declearFileName, delcearTS);
            x();
        }));
    }
}
/**
 * 对中间件进行操作，生成ts，监听改变并编译回传
 */
async function operatrionMiddleware(comp: IComponent, s: Socket.Socket, tsfileName: string) {
    const text = addDeclear(comp.ts || comp.script); // ts||script 有ts就写入ts，没有js
    await fsp.writeFile(tsfileName, text);
    fs.watchFile(tsfileName, {}, async () => {
        console.info('文件改变开始重新生成');
        const { ts, src } = await getPrueTs(tsfileName!);
        if (ts === undefined) {
            throw new Error(`分割错误:${src}`);
        }
        const js = await ts2js(ts); // ts转es5的js
        s.emit('code-change', ts, js);
    });
}

/**
 * 对流输入输出组件进行操作，生成ts&html，监听改变并编译回传
 */
async function operationIOComponent(comp: IComponent, s: Socket.Socket, tsfileName: string, htmlFileName: string) {
    let html: string;
    if (comp.script) { // 使用修改过组件
        html = comp.script;
        fs.writeFileSync(htmlFileName, html);
    } else if (comp.repositoryId === undefined || (comp.script && comp.script.length === 0)) { // 使用修改过组件
        html = `<div></div>
                    <script>$('div').innerHTML = 'hello world';</script>`;
        fs.writeFileSync(htmlFileName, html);
    } else { // 使用修改过组件
        const { local } = await getRepoInfo();
        const target = local.find(x => x.id === comp.repositoryId)!;
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
        console.info('ts文件改变开始重新编译，并插入到对应的html文件');
        const { ts, src } = await getPrueTs(tsfileName!);
        if (ts === undefined) {
            throw new Error(`分割错误:${src}`);
        }
        const js = await ts2js(ts); // ts转es5的js
        doc.querySelector('#edit-ts')!.innerHTML = ts;
        doc.querySelector('#run-js')!.innerHTML = js;
        fs.writeFileSync(htmlFileName, doc.body.innerHTML); // 重写
    });
    fs.watchFile(htmlFileName, () => {
        const html = fs.readFileSync(htmlFileName).toString();
        s.emit('code-change', html);
        console.info('html文件上传');
    });
}
