'use strict';
const {app, BrowserWindow, dialog, shell, session, ipcMain} = require('electron');
const setup=require('./model-setup.cjs');
const {spawn} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
if(process.env.LECTURE_TEST_DATA)app.setPath('userData',process.env.LECTURE_TEST_DATA);
let runtime, window, stopping=false, allowClose=false, closing=false;
const origin='http://127.0.0.1:8766';
const token=randomBytes(32).toString('hex');
if(!app.requestSingleInstanceLock()){app.quit()}
else {
  app.on('second-instance',()=>{if(window){window.restore();window.focus()}});
  app.whenReady().then(start).catch(error=>{dialog.showErrorBox('课伴无法启动', error.message);app.quit()});
}
async function start(){
  const root=path.resolve(__dirname,'..');
  const data=path.join(app.getPath('userData'),'classroom-data');
  fs.mkdirSync(data,{recursive:true});
  await setup.startInstalled(data,app.isPackaged?null:root);
  const trusted=event=>{if(event.senderFrame?.url.split('#')[0].startsWith(origin+'/')!==true)throw Error('Only the local classroom may prepare models')};
  ipcMain.handle('lecture:install-ollama',async event=>{trusted(event);return setup.install(data)});
  ipcMain.handle('lecture:setup-progress',event=>{trusted(event);return setup.progress()});
  const executable=app.isPackaged?path.join(process.resourcesPath,'runtime','lecture-runtime.exe'):path.join(root,'.venv','Scripts','python.exe');
  const web=app.isPackaged?path.join(process.resourcesPath,'web'):path.join(root,'desktop','web');
  const args=app.isPackaged?[]:[path.join(root,'desktop','launcher.py')];
  args.push('--web-dir',web,'--data-dir',data,'--port','8766');
  const log=fs.openSync(path.join(data,'runtime.log'),'a');
  runtime=spawn(executable,args,{windowsHide:true,env:{...process.env,LECTURE_TOKEN:token},stdio:['ignore',log,log]});
  let failed;
  runtime.once('error',error=>{failed=error});
  runtime.once('exit',code=>{if(!stopping){failed=new Error('本机服务已退出，错误码 '+code+'。请查看 '+path.join(data,'runtime.log'));if(window){dialog.showErrorBox('本机服务已停止',failed.message);app.quit()}}});
  let ready=false;
  for(let attempt=0;attempt<90;attempt++){
    if(failed)throw failed;
    try{const response=await fetch(origin+'/api/health',{headers:{'X-Lecture-Token':token},signal:AbortSignal.timeout(1000)});if(response.ok){const body=await response.json();if(body.ready){ready=true;break}}}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw Error('本机服务未能启动。端口 8766 可能已占用，请关闭旧窗口后重试。');
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>{
    const same=contents.getURL().startsWith(origin+'/');
    callback(same&&permission==='media'&&(!details.mediaTypes||details.mediaTypes.every(x=>x==='audio')));
  });
  session.defaultSession.setPermissionCheckHandler((contents,permission,requestingOrigin)=>permission==='media'&&requestingOrigin===origin);
  // No classroom content may leave the local runtime through the renderer.
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{
    const protocol=new URL(details.url).protocol;
    callback({cancel: !details.url.startsWith(origin+'/') && !details.url.startsWith('ws://127.0.0.1:8766/') && !['data:','blob:','devtools:'].includes(protocol)});
  });
  window=new BrowserWindow({width:1440,height:960,minWidth:850,minHeight:650,backgroundColor:'#f5f7f4',title:'课伴',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
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
  // Used only by local automated verification; never enables an external debug port.
  if(process.env.LECTURE_SMOKE_TEST==='1')setTimeout(()=>window.close(),6000);
}
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{
  if(window&&!window.isDestroyed()&&!allowClose){event.preventDefault();window.close();return}
  stopping=true;if(runtime&&!runtime.killed)runtime.kill();setup.stop();
});
