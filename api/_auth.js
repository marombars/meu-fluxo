import crypto from 'node:crypto';
const maxAge=60*60*12;
function secret(){return process.env.SESSION_SECRET||''}
export function sign(){const exp=Math.floor(Date.now()/1000)+maxAge;const data=`authenticated.${exp}`;const sig=crypto.createHmac('sha256',secret()).update(data).digest('base64url');return `${data}.${sig}`}
export function valid(token=''){const parts=token.split('.');if(parts.length!==3||parts[0]!=='authenticated')return false;const data=`${parts[0]}.${parts[1]}`;const expected=crypto.createHmac('sha256',secret()).update(data).digest('base64url');const a=Buffer.from(parts[2]);const b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b)&&Number(parts[1])>Date.now()/1000}
export function cookie(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>x.trim().split('=')))['mf_session']||''}
export const cookieOptions=`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
