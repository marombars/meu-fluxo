import {neon} from '@neondatabase/serverless';
import {valid,cookie} from './_auth.js';

const empty={transactions:[],accounts:[],goals:[],budgets:[],categories:[]};

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!valid(cookie(req)))return res.status(401).json({error:'Sessão inválida'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'Banco de dados indisponível'});
 if(!['GET','PUT'].includes(req.method))return res.status(405).json({error:'Método não permitido'});
 try{
  const sql=neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS app_data (user_key text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  const userKey=process.env.APP_USER||'primary';
  if(req.method==='GET'){
   const rows=await sql`SELECT payload, updated_at FROM app_data WHERE user_key=${userKey}`;
   return res.status(200).json({data:rows[0]?.payload||null,updatedAt:rows[0]?.updated_at||null});
  }
  const data=req.body?.data;
  if(!data||typeof data!=='object')return res.status(400).json({error:'Dados inválidos'});
  const payload={
   transactions:Array.isArray(data.transactions)?data.transactions:empty.transactions,
   accounts:Array.isArray(data.accounts)?data.accounts:empty.accounts,
   goals:Array.isArray(data.goals)?data.goals:empty.goals,
   budgets:Array.isArray(data.budgets)?data.budgets:empty.budgets,
   categories:Array.isArray(data.categories)?data.categories:empty.categories
  };
  if(JSON.stringify(payload).length>2_000_000)return res.status(413).json({error:'Base de dados muito grande'});
  await sql`INSERT INTO app_data (user_key,payload,updated_at) VALUES (${userKey},${JSON.stringify(payload)}::jsonb,now()) ON CONFLICT (user_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`;
  return res.status(200).json({ok:true});
 }catch(error){
  console.error('database error',error);
  return res.status(500).json({error:'Não foi possível acessar o banco de dados'});
 }
}
