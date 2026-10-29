import {expect,test} from "@playwright/test";
import {CUSTOMER,signIn} from "./helpers";

test("Today sends an explicitly entered question once and opens its answer",async({page},testInfo)=>{
  const questions:unknown[]=[];
  await page.route('**/api/assistant/ask',async route=>{
    questions.push(route.request().postDataJSON());
    await route.fulfill({json:{ask_id:990001}});
  });
  await page.route('**/api/assistant/ask/990001',async route=>{
    await route.fulfill({json:{ask_id:990001,status:'done',progress_pct:100,phase:null,elapsed_seconds:1,
      answer:'Synthetic browser test answer: question received.',tools_used:[],queries:[],iterations:1,error:null}});
  });
  await signIn(page,CUSTOMER);
  const form=page.getByRole('form',{name:'Ask Olie from Today'});
  const input=form.getByRole('textbox',{name:'Ask Olie a property question'});
  const submit=form.getByRole('button',{name:'Send question to Olie'});
  await expect(submit).toBeDisabled();
  expect(questions).toEqual([]);
  const title=await page.getByRole('heading',{name:"Today's brief",exact:true}).boundingBox();
  const bar=await form.boundingBox();
  expect(bar!.y).toBeGreaterThan(title!.y+title!.height);
  await page.screenshot({path:testInfo.outputPath('today-ask-bar.png')});
  await input.fill('Compare Riverhead and Kumeū');
  await submit.click();
  await expect(page).toHaveURL(/\/ask$/);
  await expect(page.getByText('Synthetic browser test answer: question received.',{exact:true})).toBeVisible();
  expect(questions).toEqual([{question:'Compare Riverhead and Kumeū',history:[]}]);
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.endsWith(':compose')))).toEqual([]);
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(questions).toHaveLength(1);
});

test("blocked storage keeps the question on Today without creating a paid job",async({page})=>{
  let starts=0;
  page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/assistant/ask')starts++;});
  await signIn(page,CUSTOMER);
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key.endsWith(':compose'))throw new Error('Synthetic storage restriction');original.call(this,key,value);};
  });
  await page.getByRole('textbox',{name:'Ask Olie a property question'}).fill('Check Riverhead');
  await page.getByRole('button',{name:'Send question to Olie'}).click();
  await expect(page.getByRole('region',{name:"Ask Olie from today's brief"}).getByRole('alert')).toContainText('This browser could not pass your question');
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('textbox',{name:'Ask Olie a property question'})).toHaveValue('Check Riverhead');
  expect(starts).toBe(0);
});

test("the Today question bar fits a phone",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await signIn(page,CUSTOMER);
  await expect(page.getByRole('textbox',{name:'Ask Olie a property question'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Send question to Olie'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
