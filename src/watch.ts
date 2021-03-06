import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import Socket from 'socket.io';
import { getRepoInfo, JSON_HEADER, loginCert } from '.';
import { sync } from './sync';
import { debounce, tryAccessDir } from './tools';
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
const tsfileName = (comp: IComponent) => `${baseName}/${comp.name}.ts`;
const fsWatcherQuene = new Array<fs.FSWatcher>();
/**
 * 清空监听的队列 ，不然在断开连接只会取消最后一次监听的文件且会删除所有文件
 *  导致监听到一个不存在的文件抛出异常
 */
const clearFsWatcherQuene = () => {
    let watcher = fsWatcherQuene.shift();
    while (watcher) {
        watcher.close();
        watcher = fsWatcherQuene.shift();
    }
};

const addDeclear = (src?: string) => importDeclear + spector + '\r' + src;
export const watch = async (p = 2363) => {
    await sync();
    const io = Socket(p);
    console.info(`监听端口${p},等待连接`);
    io.on('connect', s => {
        const { account, csrf, cookie } = s.handshake.query;
        s.on('disconnect', async () => {
            console.log(`账号${account}已断开连接`);
            clearFsWatcherQuene();
            const dir = await fsp.readdir(baseName, { withFileTypes: true });
            await Promise.all(dir.map(x => fsp.unlink(`${baseName}/${x.name}`))); // 断开连接后删除这个文件夹
            await fsp.rmdir(baseName);
        });
        s.on(baseName, async (comp: IComponent) => {
            await tryAccessDir(baseName);
            console.log(`组件:${comp.name}已选择作为操作组件，使用编辑器打开[${tsfileName(comp)}]进行编辑`);
            await checkDeclear(s);
            if (comp.type === 'middleware') { // 中间件没有远程直接写js,ts就行
                await operatrionMiddleware(comp, s);
            } else {
                await operationIOComponent(comp, s);
            }
        });
        loginCert.cookieSrc = cookie;
        loginCert.csrfSrc = csrf;
        console.log(`账号${account}已连接`);
    });
};

const ts2js = async (ts: string, count = 0): Promise<string> => {
    if (count > 5) {
        throw new Error('远程编译错误次数过多,已放弃。可以考虑重新保存一次文件或者使用本地编译服务器');
    }
    if (count !== 0) {
        console.info(`远程编译错误，正在重试第${count}次`);
    }
    const remote = true;
    const res = await fetch(remote ? 'https://api.ioflow.link/tsc' : 'http://127.0.0.1:7001/tsc', {
        method: 'POST',
        headers: {
            ...JSON_HEADER,
        },
        body: JSON.stringify({ ts, encode: true }),
    });
    const text = await res.text();
    const { js } = JSON.parse(text);
    const jsNormal = decodeURIComponent(js);
    // console.info(ts.length, text.length, js.length, jsNormal.length);
    if (ts.length !== 0 && js.length === 0) { // 使用部署在腾讯云上的服务器会出现一个很奇怪的情况，
        return ts2js(ts, count + 1);          // 提交ts过去有概率返回空的js，本地不会，明明是一样的代码和系统
    }
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
async function operatrionMiddleware(comp: IComponent, s: Socket.Socket) {
    const tsPath = tsfileName(comp);
    const text = addDeclear(comp.ts || comp.script); // ts||script 有ts就写入ts，没有js
    await fsp.writeFile(tsPath, text);
    const watcher = fs.watch(tsPath, {}, debounce(async () => { // 使用节流避免在短时间内的多次修改文件
        console.info('文件改变开始重新生成');                         // 例如vscode在保存文件时会先写空文件再保存需要保存的文件，触发2次
        const { ts, src } = await getPrueTs(tsPath);           // 使用watchfile仅触发一次是因为太慢
        if (ts === undefined) {
            throw new Error(`分割错误:${src}`);
        }
        const js = await ts2js(ts); // ts转es5的js
        s.emit('code-change', ts, js);
    }));
    fsWatcherQuene.push(watcher);
}

/**
 * 对流输入输出组件进行操作，生成ts&html，监听改变并编译回传
 */
async function operationIOComponent(comp: IComponent, s: Socket.Socket) {
    const tsPath = tsfileName(comp);
    const htmlFileName = `${baseName}/${comp.name}.html`;
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
    fs.writeFileSync(tsPath, addDeclear(tsDom.innerHTML));
    const tsWatcher = fs.watch(tsPath, debounce(async () => {
        const html = fs.readFileSync(htmlFileName).toString();
        const doc = parse.parseFromString(html, 'text/html');
        console.info('ts文件改变开始重新编译，并插入到对应的html文件');
        const { ts, src } = await getPrueTs(tsPath);
        if (ts === undefined) {
            throw new Error(`分割错误:${src}`);
        }
        const js = await ts2js(ts); // ts转es5的js
        doc.querySelector('#edit-ts')!.innerHTML = ts;
        doc.querySelector('#run-js')!.innerHTML = js;
        fs.writeFileSync(htmlFileName, doc.body.innerHTML); // 重写
    }));
    const htmlWatcher = fs.watch(htmlFileName, debounce(() => {
        const html = fs.readFileSync(htmlFileName).toString();
        s.emit('code-change', html);
        console.info('ts编译完成,上传html文件');
    }));
    fsWatcherQuene.push(htmlWatcher, tsWatcher);
}
