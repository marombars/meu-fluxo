export default function handler(req,res){res.setHeader('Set-Cookie','mf_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');res.status(200).json({ok:true})}
