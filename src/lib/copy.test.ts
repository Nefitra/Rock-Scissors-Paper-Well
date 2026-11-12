import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {locales,getTranslation} from './i18n';
import {translateCopy,enumLabel,localizedError} from './copy';
import aliases from './copy-aliases.json';
function flatten(value:any,prefix=''):Record<string,string>{return Object.fromEntries(Object.entries(value).flatMap(([key,child])=>{const path=prefix?`${prefix}.${key}`:key;return typeof child==='string'?[[path,child]]:Object.entries(flatten(child,path));}));}
const english=flatten(locales.en);
test('all 12 catalogs contain identical nonempty keys and interpolation parameters',()=>{
 assert.equal(Object.keys(locales).length,12);
 for(const [language,catalog]of Object.entries(locales)){
  const entries=flatten(catalog);assert.deepEqual(Object.keys(entries).sort(),Object.keys(english).sort(),language);
  for(const [key,value]of Object.entries(entries)){
   assert.ok(value.trim(),`${language}:${key}`);
   assert.deepEqual(value.match(/\{\w+\}/g)?.sort()??[],english[key].match(/\{\w+\}/g)?.sort()??[],`${language}:${key}`);
  }
 }
});
test('every source alias resolves in every language',()=>{
 for(const language of Object.keys(locales))for(const [source,key]of Object.entries(aliases))assert.notEqual(translateCopy(language,source),key,`${language}:${source}`);
});
test('translated statuses leave wire values intact; Arabic and unknown-language fallbacks work',()=>{
 const raw='completed';assert.equal(enumLabel('de',raw),'Abgeschlossen');assert.equal(raw,'completed');
 assert.equal(translateCopy('ar','Открыть управление игрой'),locales.ar.ui.adminOpen);
 assert.equal(getTranslation('unknown','ui.chooseWeapon'),locales.en.ui.chooseWeapon);
 assert.equal(getTranslation('ru','play.stakeDisclaimer',{stake:100}).includes('100'),true);
 assert.equal(localizedError('de','Version conflict'),locales.de.ui.stale);
 assert.equal(localizedError('ja','Unexpected private server diagnostics'),locales.ja.ui.requestError);
});
test('literal translation keys used by the UI exist',()=>{
 for(const file of ['src/App.tsx','src/components/AdminPanel.tsx','src/components/WindowGame.tsx']){
  const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['t','tx'].includes(node.expression.text)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){
   const key=node.arguments[0].text;assert.ok(english[key]||(aliases as Record<string,string>)[key],`${file}: ${key}`);
  }ts.forEachChild(node,visit);};visit(ast);
 }
});

test('administrator navigation renders in all 12 languages without a Telegram session',async()=>{
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {default:AdminPanel}=await import('../components/AdminPanel');
 for(const language of Object.keys(locales)){
  const html=renderToStaticMarkup(React.createElement(AdminPanel,{currentLanguage:language}));
  for(const key of ['players','transactions','settings','audit'])assert.ok(html.includes(getTranslation(language,'ui.'+key)),`${language}:${key}`);
 }
});
