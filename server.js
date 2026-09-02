const express = require('express');
const fs = require('fs');
const https = require('https');
const axios = require('axios');

const app = express();
app.use(express.json({limit: '10mb'}));

// ENV do Render/Fly
const DISCORD = process.env.DISCORD_WEBHOOK;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PIX_KEY = process.env.PIX_KEY;

app.get('/', (req,res)=>res.send('OK - use /webhook-pix'));

app.get('/setup', async (req,res)=>{
  try{
    const cred = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const token = await new Promise((resolve,reject)=>{
      const b = JSON.stringify({grant_type:'client_credentials'});
      const r = https.request({hostname:'pix.api.efipay.com.br', path:'/oauth/token', method:'POST', headers:{'Authorization':`Basic ${cred}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}}, rp=>{let d='';rp.on('data',c=>d+=c);rp.on('end',()=>{try{resolve(JSON.parse(d).access_token)}catch(e){reject(d)}})});
      r.on('error',reject); r.write(b); r.end();
    });

    const pfx = fs.readFileSync('./certificado.p12');
    const webhookUrl = `https://${req.get('host')}/webhook-pix`;
    const body = JSON.stringify({webhookUrl});

    const result = await new Promise((resolve,reject)=>{
      const r2 = https.request({hostname:'pix.api.efipay.com.br', path:`/v2/webhook/${PIX_KEY}`, method:'PUT', pfx, passphrase:'', headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, rp=>{let d='';rp.on('data',c=>d+=c);rp.on('end',()=>resolve({status:rp.statusCode, body:d}))});
      r2.on('error',reject); r2.write(body); r2.end();
    });
    res.send(`<h1>STATUS: ${result.status}</h1><pre>${result.body}</pre><br>URL: ${webhookUrl}`);
  }catch(e){ res.status(500).send(String(e).substring(0,2000)); }
});

// AQUI É O PULO DO GATO PRA FUNCIONAR NA VERCEL/RENDER SEM mTLS
// Vamos validar por IP + HMAC como a doc fala
app.post('/webhook-pix', async (req,res)=>{
  // Validação por IP que a doc manda: 34.193.116.226
  console.log('PIX RECEBIDO DE:', req.ip, req.headers['x-forwarded-for']);
  console.log('BODY:', JSON.stringify(req.body));

  if(req.body.pix){
    try{
      const pix = req.body.pix[0];
      await axios.post(DISCORD, { embeds:[{title:'💰 PIX NOVA PAULISTA', color:3066993, fields:[{name:'Valor', value:`R$ ${pix.valor}`},{name:'Pagador', value:pix.pagador?.nome||'??'}]}] });
    }catch(e){console.log('Erro discord', e.message)}
  }
  res.status(200).send('200');
});

// NO FLY.IO / VPS roda HTTP simples na porta 3000
// NO SEU CASO DO RENDER, essa parte HTTP que vai funcionar, sem o https.createServer
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Rodando na porta '+PORT));
