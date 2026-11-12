import test from 'node:test';
import assert from 'node:assert/strict';
import * as sound from './sound';

test('sounds reuse one context, persist volume, and mute stops scheduled melodies',()=>{
 const values=new Map<string,string>();let contexts=0;let stops=0;let starts=0;
 const param=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 class FakeContext{
  currentTime=1;state='running';destination={};constructor(){contexts++;}
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createDynamicsCompressor(){return {threshold:param(),knee:param(),ratio:param(),connect(){}};}
  createOscillator(){return {frequency:param(),type:'',connect(){},disconnect(){},onended:null,start(){starts++;},stop(){stops++;}};}
 }
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)};
 const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{AudioContext:FakeContext}});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
 try{
  sound.setSoundVolume(0.4);sound.playClickSound();sound.playWinChime();sound.playMatchFoundSound();
  assert.equal(contexts,1);assert.ok(starts>10);assert.equal(sound.getSoundVolume(),0.4);
  const before=stops;sound.setMuted(true);assert.ok(stops>before);
  const mutedStarts=starts;sound.playWinChime();assert.equal(starts,mutedStarts);
  sound.setMuted(false);sound.playClickSound();assert.ok(starts>mutedStarts);
  sound.setSoundVolume(100);assert.equal(sound.getSoundVolume(),1);
  sound.setSoundVolume(-1);assert.equal(sound.getSoundVolume(),0);
  sound.setSoundVolume(NaN);assert.equal(sound.getSoundVolume(),0.55);
 }finally{
  if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else delete (globalThis as any).window;
  if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete (globalThis as any).localStorage;
 }
});
