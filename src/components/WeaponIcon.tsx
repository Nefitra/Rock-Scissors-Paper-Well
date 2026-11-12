import React from 'react';

export type WeaponKind = 'rock' | 'scissors' | 'paper' | 'well';
/** Original, code-native arena mascots. Labels belong to the adjacent translated text. */
export default function WeaponIcon({kind,className='w-16 h-16'}:{kind:string;className?:string}) {
  const face=<g stroke="#292541" strokeWidth="2.4" fill="none" strokeLinecap="round"><path d="M26 36v3m12-3v3"/><path d="M28 44q4 4 8 0"/><path d="M21 42h3m16 0h3" stroke="#ef8cac"/></g>;
  return <svg viewBox="0 0 64 64" className={`weapon-mascot ${className}`} aria-hidden="true" focusable="false">
    <ellipse cx="32" cy="58" rx="22" ry="3" fill="#080c25" opacity=".25"/>
    {kind==='rock'?<><path d="M10 42 14 22 28 12 45 17 55 34 49 51 29 55 13 50Z" fill="#c5adff" stroke="#433367" strokeWidth="3" strokeLinejoin="round"/><path d="m18 26 11-8 10 3" fill="none" stroke="#f0e8ff" strokeWidth="4" strokeLinecap="round"/>{face}</>:null}
    {kind==='paper'?<><path d="M16 9h25l9 10v34q0 3-4 3H17q-4 0-4-4V13q0-4 3-4Z" fill="#a3e8e7" stroke="#205a65" strokeWidth="3" strokeLinejoin="round"/><path d="M40 10v12h10M20 27h12" fill="none" stroke="#4a9ca5" strokeWidth="3" strokeLinecap="round"/>{face}</>:null}
    {kind==='scissors'?<><path d="m25 35-9-24q-1-5 3-4l15 24L47 8q3-3 4 1l-9 28" fill="#ffde9b" stroke="#765425" strokeWidth="3" strokeLinejoin="round"/><path d="M14 39q-4 12 6 16 10 3 12-9 3 13 13 9 10-4 6-15L36 28Z" fill="#ffb4cd" stroke="#7c3c60" strokeWidth="3" strokeLinejoin="round"/>{face}</>:null}
    {kind==='well'?<><path d="M11 29h42v21q-21 13-42 0Z" fill="#9bbcff" stroke="#334878" strokeWidth="3" strokeLinejoin="round"/><path d="M12 40h40M24 31v9m16 1v12" stroke="#627fbb" strokeWidth="2"/><ellipse cx="32" cy="29" rx="24" ry="10" fill="#bcd1ff" stroke="#334878" strokeWidth="3"/><ellipse cx="32" cy="29" rx="16" ry="5" fill="#354278"/><g transform="translate(0 7)">{face}</g><path d="m47 12 2-5 2 5 5 2-5 2-2 5-2-5-5-2Z" fill="#ffe090"/></>:null}
  </svg>;
}
