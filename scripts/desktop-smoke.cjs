/* End-to-end check using the real Electron window, local LLM and persistence. */
const {_electron}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
  const root=path.resolve(__dirname,'..'),data=path.join(root,'test-results',process.env.LECTURE_APP_EXE?'packaged-profile':'desktop-profile');fs.mkdirSync(data,{recursive:true});
  const app=await _electron.launch({executablePath:process.env.LECTURE_APP_EXE||path.join(root,'node_modules','electron','dist','electron.exe'),args:process.env.LECTURE_APP_EXE?[]:[root],env:{...process.env,HF_HUB_OFFLINE:'1',LECTURE_TEST_DATA:data}});
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.waitForFunction(()=>document.querySelector('#courseSelect')?.options.length>0&&$('reliabilityStatus').textContent.includes('首次'),{timeout:30000});
    console.log('desktop booted');
    if(process.env.LECTURE_ASR_VERIFY==='1'){
      const pcm=fs.readFileSync(path.join(root,'test-results','synthetic-economics.raw')).toString('base64');
      const transcript=await page.evaluate(async encoded=>new Promise((resolve,reject)=>{
        const url=new URL('/v1/stream',location.origin);url.protocol='ws:';url.searchParams.set('token',window.localToken);const socket=new WebSocket(url),rows=[];
        const timer=setTimeout(()=>{socket.close();reject(Error('Packaged ASR timeout'))},120000);
        socket.onopen=()=>socket.send(JSON.stringify({type:'start',sample_rate:16000,language:'en',course_id:window.localCourseId}));
        socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.type==='ready'){const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));for(let offset=0;offset<bytes.length;offset+=64000)socket.send(bytes.slice(offset,offset+64000));socket.send(JSON.stringify({type:'stop'}))}else if(data.type==='captions')rows.push(...data.stable.map(x=>x.text));else if(data.type==='error'){clearTimeout(timer);socket.close();reject(Error(data.error))}};
        socket.onclose=()=>{clearTimeout(timer);resolve(rows.join(' '))};socket.onerror=()=>reject(Error('Packaged ASR connection failed'));
      }),pcm);
      assert.ok(transcript.toLowerCase().includes('opportunity cost'),transcript);console.log('offline packaged Whisper ASR passed');
    }
    await page.locator('#addCourse').click();await page.locator('#courseName').fill('Desktop QA · Economics');await page.locator('#createCourse').click();await page.waitForFunction(()=>!document.querySelector('#courseDialog').open);
    const course=await page.evaluate(()=>window.localCourseId);
    console.log('course created');
    await page.evaluate(()=>{$('title').value='Week 1 · Opportunity cost';items=[{text:'Opportunity cost is the value of the next best alternative forgone.',translation:'机会成本是放弃的次佳选择的价值。',time:'00:00',code:'en-US',lang:'英语'}];render();});
    await page.evaluate(()=>window.localFlush());
    console.log('lecture saved');
    await page.locator('#summarize').click();await page.waitForFunction(()=>!$('summarize').dataset.busy,{timeout:300000});
    const result=await page.evaluate(()=>({summary:summaryData,message:$('toast').textContent}));assert.ok(result.summary?.overview,JSON.stringify(result));
    console.log('summary rendered');
    await page.locator('#summaryPane > details > summary').click();await page.locator('#summaryFeedback').fill('Compare opportunity cost and sunk cost; retain definitions.');await page.locator('#saveSummaryFeedback').click();await page.waitForFunction(()=>$('learningStatus').textContent.includes('1 条总结建议'));
    await page.locator('[data-study="mindmap"]').click();const mapSize=await page.locator('.map-node').count();assert.ok(mapSize>=1);
    await page.evaluate(()=>window.localFlush());await page.locator('[data-view="library"]').click();await page.locator('[data-open-local]').first().click();await page.locator('[data-study="mindmap"]').click();assert.equal(await page.locator('.map-node').count(),mapSize);
    await page.locator('[data-view="glossary"]').click();await page.locator('#termSource').fill('opportunity cost');await page.locator('#termTranslation').fill('机会成本');await page.locator('#addTerm').click();await page.waitForFunction(()=>$('glossaryList').textContent.includes('机会成本'));
    await page.locator('[data-view="documents"]').click();assert.equal(await page.locator('#documentStart').isVisible(),true);
    await page.locator('[data-view="classroom"]').click();await page.screenshot({path:path.join(root,'test-results','desktop-classroom.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS: courses, save, real summary/mindmap persistence, feedback memory, glossary, document tab; no page errors');
  }catch(error){console.error('UI test failed:',error);console.error('Page errors:',errors);await page.screenshot({path:path.join(root,'test-results','desktop-error.png')}).catch(()=>{});throw error}finally{await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
