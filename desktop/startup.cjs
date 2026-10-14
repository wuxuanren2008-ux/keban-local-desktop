'use strict';
const net=require('node:net');
function probePort(port){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>{const actual=server.address().port;server.close(error=>error?reject(error):resolve(actual))})})}
async function selectRuntimePort(preferred=8766){try{return await probePort(preferred)}catch(error){if(error.code!=='EADDRINUSE'&&error.code!=='EACCES')throw error;return probePort(0)}}
async function waitForRuntime({origin,token,getFailure=()=>null,fetchImpl=fetch,timeoutMs=180000,requestTimeoutMs=5000,pauseMs=500,onProgress=()=>{},now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const started=now();let attempts=0;
  while(now()-started<timeoutMs){
    const failure=getFailure();if(failure)throw failure;
    try{
      // This endpoint tests only our runtime. Ollama/model availability is
      // checked by the classroom UI and must never prevent first launch.
      const response=await fetchImpl(origin+'/api/ready',{headers:{'X-Lecture-Token':token},signal:AbortSignal.timeout(requestTimeoutMs)});
      if(response.ok&&(await response.json()).ready===true)return {elapsedMs:now()-started,attempts:++attempts};
    }catch{}
    onProgress({elapsedMs:now()-started,attempts:++attempts});await sleep(pauseMs);
  }
  throw getFailure()||Error('本机服务启动超时。首次解压可能较慢；请查看 startup.log 与 runtime.log 后重试。');
}
module.exports={selectRuntimePort,waitForRuntime};
