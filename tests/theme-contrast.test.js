const assert = require('node:assert/strict');
const fs = require('node:fs');
const css=fs.readFileSync('app/src/main/assets/styles.css','utf8');
const blocks=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
function declarations(selector){const found=blocks.filter(x=>x[1].trim()===selector);assert.ok(found.length,selector);return Object.fromEntries(found.flatMap(x=>[...x[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()])));}
const light=declarations(':root'), dark={...light,...declarations(':root[data-theme="dark"]')};
function resolve(v,vars){return v.replace(/var\((--[\w-]+)\)/g,(_,k)=>vars[k]).replace(/\bwhite\b/g,'#ffffff');}
function luminance(hex){const rgb=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (values[1]+.05)/(values[0]+.05);}
const checks=[];
for(const [theme,vars] of [['light',light],['dark',dark]]){
  for(const selector of ['.slot.selected','.success-mark','.btn-primary']){
    const base=declarations(selector);
    const override=blocks.some(x=>x[1].trim()===`:root[data-theme="${theme}"] ${selector}`)?declarations(`:root[data-theme="${theme}"] ${selector}`):{};
    const rule={...base,...override};
    const fg=resolve(rule.color,vars), backgrounds=resolve(rule.background,vars).match(/#[0-9a-f]{6}/ig);
    for(const bg of backgrounds){const ratio=contrast(fg,bg);assert.ok(ratio>=4.5,`${theme} ${selector}: ${ratio.toFixed(3)}:1`);checks.push({theme,selector,foreground:fg,background:bg,ratio:Number(ratio.toFixed(3))});}
  }
  for(const color of ['--ink','--muted','--accent-text']) assert.ok(contrast(vars[color],vars['--surface'])>=4.5,`${theme} ${color}`);
}
console.log('CSS-derived contrast checks passed:',JSON.stringify(checks));
