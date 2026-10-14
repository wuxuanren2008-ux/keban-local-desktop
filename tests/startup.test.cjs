const {test}=require('node:test');const assert=require('node:assert/strict');const net=require('node:net');
const {waitForRuntime,selectRuntimePort}=require('../desktop/startup.cjs');
test('first launch never probes slow or absent model services',async()=>{
 let requested;
 const result=await waitForRuntime({origin:'http://127.0.0.1:5555',token:'test',fetchImpl:async(url,options)=>{requested=url;assert.equal(options.headers['X-Lecture-Token'],'test');return{ok:true,json:async()=>({ready:true})}}});
 assert.equal(requested,'http://127.0.0.1:5555/api/ready');assert.equal(result.attempts,1);
});
test('readiness retries cold startup and preserves actual child failure',async()=>{
 let ticks=0,requests=0;await waitForRuntime({origin:'http://127.0.0.1:5555',token:'test',now:()=>ticks,sleep:async ms=>ticks+=ms,fetchImpl:async()=>({ok:++requests>=4,json:async()=>({ready:true})})});assert.equal(requests,4);
 const failure=Error('runtime DLL load failed');await assert.rejects(waitForRuntime({origin:'http://127.0.0.1:5555',token:'test',getFailure:()=>failure}),/DLL load failed/);
});
test('occupied preferred port gets a separate loopback port without touching its owner',async()=>{
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const occupied=server.address().port;
 try{const chosen=await selectRuntimePort(occupied);assert.notEqual(chosen,occupied);assert.ok(chosen>0);assert.equal(server.listening,true)}finally{await new Promise(resolve=>server.close(resolve))}
});
