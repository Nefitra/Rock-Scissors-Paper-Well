/** Small, bright arcade melodies. One shared audio graph; no audio downloads. */
let context: AudioContext | null = null;
let master: GainNode | null = null;
const playing = new Set<OscillatorNode>();
function read(key:string,fallback:string) {try{return localStorage.getItem(key)??fallback;}catch{return fallback;}}
export function isMuted() {return typeof window==='undefined'||read('rspw_muted','false')==='true';}
export function getSoundVolume() {const n=Number(read('rspw_volume','0.55'));return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0.55;}
export function setSoundVolume(value:number) {const n=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0.55;try{localStorage.setItem('rspw_volume',String(n));}catch{}if(master&&context)master.gain.setTargetAtTime(n*0.32,context.currentTime,0.015);}
export function setMuted(value:boolean) {
  try{localStorage.setItem('rspw_muted',String(value));}catch{}
  if(value){for(const oscillator of playing){try{oscillator.stop();}catch{}}playing.clear();}
}
export function toggleMute() {const value=!isMuted();setMuted(value);return value;}
function graph() {
  if(isMuted()||typeof window==='undefined')return null;
  try{
    if(!context||context.state==='closed'){
      const Constructor=window.AudioContext||(window as any).webkitAudioContext;
      if(!Constructor)return null;
      context=new Constructor();master=context!.createGain();
      const limiter=context!.createDynamicsCompressor();
      limiter.threshold.value=-18;limiter.knee.value=18;limiter.ratio.value=6;
      master!.connect(limiter);limiter.connect(context!.destination);
    }
    master!.gain.setValueAtTime(getSoundVolume()*0.32,context!.currentTime);
    if(context!.state==='suspended')void context!.resume().catch(()=>{});
    return {ctx:context!,output:master!};
  }catch{return null;}
}
function melody(notes:number[],step=0.09,duration=0.22) {
  const audio=graph();if(!audio)return;
  const {ctx,output}=audio;
  notes.forEach((frequency,index)=>{
    const start=ctx.currentTime+index*step;
    // A soft fundamental and quiet octave give a toy-bell timbre without a sharp buzz.
    [1,2].forEach((harmonic)=>{
      const oscillator=ctx.createOscillator(),envelope=ctx.createGain();
      oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency*harmonic,start);
      envelope.gain.setValueAtTime(0,start);
      envelope.gain.linearRampToValueAtTime(harmonic===1?0.38:0.055,start+0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001,start+duration);
      oscillator.connect(envelope);envelope.connect(output);playing.add(oscillator);
      oscillator.onended=()=>{playing.delete(oscillator);oscillator.disconnect();envelope.disconnect();};
      oscillator.start(start);oscillator.stop(start+duration+0.02);
    });
  });
}
export function playClickSound(){melody([783.99],0,0.09);}
export function playMatchFoundSound(){melody([659.25,783.99,1046.5,1318.51],0.085,0.25);}
export const playMatchmakingPing=playMatchFoundSound;
export function playCountdownSound(isGo=false){melody(isGo?[783.99,1046.5]:[659.25],0.075,isGo?0.23:0.11);}
export function playRoundStartSound(){melody([523.25,783.99,1046.5],0.055,0.18);}
export function playWinChime(){melody([523.25,659.25,783.99,1046.5,1318.51,1567.98],0.075,0.32);}
export const playVictorySound=playWinChime;
export function playDefeatSound(){melody([659.25,587.33,523.25],0.13,0.22);}
export function playDrawSound(){melody([659.25,783.99,659.25],0.11,0.18);}
export function playReferralSound(){melody([783.99,1046.5,1318.51],0.07,0.24);}
export function playWalletConnectSound(){melody([523.25,659.25,1046.5],0.09,0.22);}
export function playRewardXPSound(){melody([783.99,1046.5,1318.51,1567.98],0.065,0.28);}
export function playNotificationSound(){melody([1046.5,1318.51],0.085,0.18);}
