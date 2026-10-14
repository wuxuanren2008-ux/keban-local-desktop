'use strict';
const {app, BrowserWindow, dialog, shell, session, ipcMain,Menu,systemPreferences,desktopCapturer,screen} = require('electron');
const {platformPaths,sameOrigin}=require('./platform.cjs');
const {installSystemCapture}=require('./system-capture.cjs');
const {createSubtitleWindow}=require('./subtitle-window.cjs');
const setup=require('./model-setup.cjs');
const {spawn} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {selectRuntimePort,waitForRuntime}=require('./startup.cjs');
if(process.env.LECTURE_TEST_DATA)app.setPath('userData',process.env.LECTURE_TEST_DATA);
let runtime, window, stopping=false, allowClose=false, closing=false;
let origin='';
const token=randomBytes(32).toString('hex');
if(!app.requestSingleInstanceLock()){app.quit()}
else {
  app.on('second-instance',()=>{if(window){window.restore();window.focus()}});
  app.whenReady().then(start).catch(error=>{if(app.startupLog)fs.appendFileSync(app.startupLog,new Date().toISOString()+' startup-failed '+error.stack+'\n');dialog.showErrorBox('课伴无法启动', error.message+(app.startupLog?'\n诊断日志：'+app.startupLog:''));app.quit()});
}
async function start(){
  const root=path.resolve(__dirname,'..');
  const data=path.join(app.getPath('userData'),'classroom-data');
  fs.mkdirSync(data,{recursive:true});
  app.startupLog=path.join(data,'startup.log');
  const logStartup=message=>fs.appendFileSync(app.startupLog,new Date().toISOString()+' '+message+'\n');
  logStartup('version='+app.getVersion()+' platform='+process.platform+' arch='+process.arch);
  const runtimePort=await selectRuntimePort();origin='http://127.0.0.1:'+runtimePort;
  const socketOrigin='ws://127.0.0.1:'+runtimePort;
  logStartup('runtime-port='+runtimePort);
  if(process.platform==='darwin'&&Number(process.getSystemVersion().split('.')[0])<14)throw Error('课伴 macOS 版需要 macOS Sonoma 14 或更新版本。');
  const paths=platformPaths({root,resourcesPath:process.resourcesPath,isPackaged:app.isPackaged,dataDir:data});
  await setup.startInstalled(data,app.isPackaged?null:root);
  const trusted=event=>{if(!window||event.sender!==window.webContents||!sameOrigin(event.senderFrame?.url,origin))throw Error('Only the local classroom may use desktop controls')};
  ipcMain.handle('lecture:install-ollama',async event=>{trusted(event);return setup.install(data)});
  ipcMain.handle('lecture:setup-progress',event=>{trusted(event);return setup.progress()});
  ipcMain.handle('lecture:platform',event=>{trusted(event);return{platform:process.platform,arch:process.arch,version:process.platform==='darwin'?process.getSystemVersion():os.release(),supportedAsrDevices:paths.supportedAsrDevices}});
  ipcMain.handle('lecture:microphone',async event=>{trusted(event);if(process.platform!=='darwin'||app.commandLine.hasSwitch('use-fake-device-for-media-stream'))return true;const current=systemPreferences.getMediaAccessStatus('microphone');return current==='granted'||(current==='not-determined'&&await systemPreferences.askForMediaAccess('microphone'))});
  const executable=paths.executable;
  const web=paths.web;
  const args=paths.args;
  args.push('--web-dir',web,'--data-dir',data,'--port',String(runtimePort));
  const log=fs.openSync(path.join(data,'runtime.log'),'a');
  const defaultModel=process.platform==='darwin'&&os.totalmem()<12*1024**3?'qwen3.5:2b':'qwen3.5:4b';
  runtime=spawn(executable,args,{windowsHide:true,env:{...process.env,LECTURE_TOKEN:token,LECTURE_DEFAULT_LLM:defaultModel},stdio:['ignore',log,log]});
  let failed;
  runtime.once('error',error=>{failed=error});
  runtime.once('exit',code=>{if(!stopping){failed=new Error('本机服务已退出，错误码 '+code+'。请查看 '+path.join(data,'runtime.log'));if(window){dialog.showErrorBox('本机服务已停止',failed.message);app.quit()}}});
  const readiness=await waitForRuntime({origin,token,getFailure:()=>failed,onProgress:state=>{if(state.attempts%20===0)logStartup('waiting-runtime elapsed-ms='+state.elapsedMs)}});
  logStartup('runtime-ready elapsed-ms='+readiness.elapsedMs);
  const capture=installSystemCapture({session:session.defaultSession,desktopCapturer,owner:()=>window,origin,platform:process.platform,version:process.platform==='darwin'?process.getSystemVersion():os.release()});
  ipcMain.handle('lecture:system-capture',event=>capture.arm(event));
  ipcMain.handle('lecture:system-capture-clear',event=>{trusted(event);capture.clear()});
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>{
    const same=capture.trusted(contents,details.requestingUrl||contents.getURL());
    callback(same&&((permission==='display-capture'&&capture.armed())||(permission==='media'&&(!details.mediaTypes||details.mediaTypes.every(x=>x==='audio')))));
  });
  session.defaultSession.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>capture.trusted(contents,details.securityOrigin||requestingOrigin)&&((permission==='display-capture'&&capture.armed())||(permission==='media'&&details.mediaType!=='video')));
  // No classroom content may leave the local runtime through the renderer.
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
    const protocol=new URL(details.url).protocol;
    const subtitleFile=details.url===pathToFileURL(path.join(__dirname,'subtitle.html')).href;
    callback({cancel: !subtitleFile && !details.url.startsWith(origin+'/') && !details.url.startsWith(socketOrigin+'/') && !['data:','blob:','devtools:'].includes(protocol)});
  });
  window=new BrowserWindow({width:1440,height:960,minWidth:850,minHeight:650,backgroundColor:'#f5f7f4',title:'课伴',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  const subtitles=createSubtitleWindow({BrowserWindow,screen,ipcMain,owner:window,origin});
  ipcMain.handle('lecture:subtitles-show',event=>{trusted(event);subtitles.show()});
  ipcMain.handle('lecture:subtitles-hide',event=>{trusted(event);subtitles.hide()});
  ipcMain.on('lecture:subtitles-update',(event,payload)=>{try{trusted(event);subtitles.update(payload)}catch{}});
  window.webContents.on('render-process-gone',()=>{capture.clear();subtitles.destroy()});
  window.once('closed',()=>{capture.clear();subtitles.destroy()});
  if(process.platform==='darwin')Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'课伴',submenu:[{role:'about'},{type:'separator'},{role:'quit'}]},{label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'窗口',submenu:[{role:'minimize'},{role:'zoom'}]}]));
  window.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://github.com/')||url.startsWith('https://ollama.com/'))shell.openExternal(url);return{action:'deny'}});
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/'))event.preventDefault()});
  window.once('ready-to-show',()=>window.show());
  window.on('close',event=>{
    if(allowClose)return;
    event.preventDefault();if(closing)return;closing=true;
    window.webContents.executeJavaScript('window.localBeforeClose ? window.localBeforeClose() : Promise.resolve()').then(()=>{allowClose=true;window.close()}).catch(async error=>{
      const choice=await dialog.showMessageBox(window,{type:'warning',buttons:['返回课堂','仍然退出'],defaultId:0,cancelId:0,title:'课堂尚未完成保存',message:'本机保存未完成，请保留窗口或导出备份。',detail:error.message});
      closing=false;if(choice.response===1){allowClose=true;window.close()}
    });
  });
  await window.loadURL(origin+'/#token='+token);
  logStartup('classroom-window-loaded');
  // Used only by local automated verification; never enables an external debug port.
  if(process.env.LECTURE_SMOKE_TEST==='1')setTimeout(()=>window.close(),6000);
}
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{
  if(window&&!window.isDestroyed()&&!allowClose){event.preventDefault();window.close();return}
  stopping=true;if(runtime&&!runtime.killed)runtime.kill();setup.stop();
});
