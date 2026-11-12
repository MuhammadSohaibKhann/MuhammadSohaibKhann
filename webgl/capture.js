const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({
 args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files']});
const p=await b.newPage({viewport:{width:1200,height:360}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+process.cwd()+'/scene.html');
await p.waitForFunction('window.ready===true',{timeout:30000});
require('fs').mkdirSync('f',{recursive:true});
for(let i=0;i<72;i++){await p.evaluate(i=>window.frame(i),i);await p.screenshot({path:`f/${String(i).padStart(3,'0')}.png`});}
await b.close();console.log('frames ok')})();
