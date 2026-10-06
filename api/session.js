import{valid,cookie}from'./_auth.js';export default function handler(req,res){return valid(cookie(req))?res.status(200).json({authenticated:true}):res.status(401).json({authenticated:false})}
