async(existingPage,options={})=>{
 const root=options.root??'/home/sheriff/Desktop/rally',base=options.base??'http://127.0.0.1:3001';
 const context=await existingPage.context().browser().newContext({viewport:{width:1600,height:680},reducedMotion:'reduce',bypassCSP:true,serviceWorkers:'block'}),page=await context.newPage(),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 const assert=(v,m)=>{if(!v)throw new Error(m)};
 try{
  for(const [width,height]of[[1600,680],[1600,900],[1440,900],[1366,618],[1280,600],[1024,768],[768,1024],[390,844],[375,667],[320,568]]){
   await page.setViewportSize({width,height});await page.goto(base);await page.locator('.welcome-copy h1').waitFor();await page.evaluate(()=>document.fonts.ready);
   const layout=await page.evaluate(()=>{const h=document.querySelector('.welcome-copy h1'),a=document.querySelector('.welcome-actions'),r=h.getBoundingClientRect(),s=getComputedStyle(h);return {headingHeight:r.height,lineHeight:parseFloat(s.lineHeight),actions:a.getBoundingClientRect().toJSON(),horizontal:document.documentElement.scrollWidth>innerWidth}});
   assert(!layout.horizontal,`Welcome overflows at ${width}x${height}`);assert(layout.actions.bottom<=height,`Main actions below fold at ${width}x${height}: ${layout.actions.bottom}`);assert(layout.headingHeight<=layout.lineHeight*2.1,`Headline wrapped past two lines at ${width}x${height}`);
   if(width<=600){assert(await page.getByRole('button',{name:'Install Rally',exact:true}).isVisible(),'Install must remain available on phones');assert(await page.getByRole('button',{name:'Scan invitation',exact:true}).isVisible(),'Scanning must remain available on phones');}
   await page.screenshot({path:root+`/test-results/polished-welcome-${width}-${height}.png`,fullPage:true});checks.push({page:'welcome',width,height,actionsVisible:true,twoLineHeading:true});
  }
  let release;const gate=new Promise(resolve=>{release=resolve});await context.route('**/api/v1/auth/me',async route=>{await gate;await route.continue()});await page.goto(base+'/sign-in');await page.getByLabel('Email address').fill('demo@rally.local');await page.getByLabel('Password',{exact:true}).fill('RallyDemo2026!');const response=page.waitForResponse('**/api/v1/auth/me');release();await response;await context.unroute('**/api/v1/auth/me');
  await page.waitForTimeout(100);assert(await page.getByLabel('Email address').inputValue()==='demo@rally.local','Initial session check erased typed email');assert((await page.getByLabel('Password',{exact:true}).inputValue()).length>0,'Initial session check erased password');checks.push({page:'direct sign-in',inputPreserved:true});
  await page.addScriptTag({path:root+'/node_modules/axe-core/axe.min.js'});const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}})).violations.map(v=>v.id));assert(!violations.length,JSON.stringify(violations));
  assert(!errors.length,JSON.stringify(errors));return {checks,javascriptErrors:errors,checkedAt:new Date().toISOString()};
 }catch(error){await page.screenshot({path:root+'/test-results/layout-failure.png',fullPage:true});return{checks,error:error.message,page:await page.locator('body').innerText()};}finally{await context.close();}
}
