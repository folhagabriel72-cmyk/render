const https = require('https');
const fs = require('fs');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || '';
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PIX_KEY = process.env.PIX_KEY;

app.get('/', (req,res)=> res.send('Webhook EFI mTLS online'));

// ROTA QUE REGISTRA O WEBHOOK SOZINHA - É SÓ ACESSAR NO NAVEGADOR
app.get('/setup', async (req, res) => {
  try {
    // Pega token
    const cred = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const token = await new Promise((resolve, reject) => {
      const body = JSON.stringify({grant_type:'client_credentials'});
      const r = https.request({
        hostname:'pix.api.efipay.com.br', path:'/oauth/token', method:'POST',
        headers:{'Authorization':`Basic ${cred}`, 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body)}
      }, resp=>{let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>{ try{resolve(JSON.parse(d).access_token)}catch(e){reject(d)}})});
      r.on('error', reject); r.write(body); r.end();
    });

    const pfx = fs.readFileSync('./certificado.p12');
    const webhookUrl = `https://${req.get('host')}/webhook-pix`;
    const body = JSON.stringify({webhookUrl});

    const result = await new Promise((resolve, reject)=>{
      const req2 = https.request({
        hostname:'pix.api.efipay.com.br', path:`/v2/webhook/${PIX_KEY}`, method:'PUT', pfx, passphrase:'',
        headers:{'Authorization':`Bearer ${token}`, 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body)}
      }, resp=>{let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>resolve({status:resp.statusCode, body:d}))});
      req2.on('error', reject); req2.write(body); req2.end();
    });

    res.send(`<h1>Resultado: ${result.status}</h1><pre>${result.body}</pre><br>Webhook URL: ${webhookUrl}<br><br>Se deu 200 ou 201, deu certo! Faz um PIX teste agora.`);
  } catch(e){ res.status(500).send('Erro: '+e); }
});

app.post('/webhook-pix', async (req, res) => {
  console.log('PIX:', JSON.stringify(req.body));
  try {
    const pix = req.body.pix?.[0];
    if(pix && DISCORD_WEBHOOK){
      await axios.post(DISCORD_WEBHOOK, {
        embeds:[{title:'💰 PIX RECEBIDO', color:3066993, fields:[{name:'Valor', value:`R$ ${pix.valor}`},{name:'Pagador', value:pix.pagador?.nome||'Cliente'}]}]
      });
    }
  } catch(e){}
  res.status(200).send('200');
});

let efiChain;
try{efiChain=fs.readFileSync('./efi-chain.crt')}catch(e){efiChain=''}

const options = {pfx:fs.readFileSync('./certificado.p12'), passphrase:'', ca:efiChain, requestCert:true, rejectUnauthorized:false};
const PORT = process.env.PORT || 10000;

https.createServer(options, (req,res)=>{
  if(!req.client.authorized){res.writeHead(401); return res.end('mTLS required');}
  return app(req,res);
}).listen(PORT, ()=>console.log('mTLS na porta '+PORT));
