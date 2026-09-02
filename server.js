const https = require('https');
const fs = require('fs');
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// DISCORD WEBHOOK - TROCA PELO SEU
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || 'https://discord.com/api/webhooks/1405566772842967142/02S2Gq7T5T5nJLEkqXq9dO3Pq-0X8Z5x9Y0a1B2c3D4e5F6g7H8i9J0k1L2M3N4O5';

app.post('/webhook-pix', async (req, res) => {
  console.log('PIX recebido:', JSON.stringify(req.body).substring(0,500));
  try {
    const pix = req.body.pix && req.body.pix[0];
    const valor = pix ? pix.valor : '??';
    const txid = pix ? pix.txid : '';
    const pagador = pix && pix.pagador ? pix.pagador.nome : 'Cliente';

    await axios.post(DISCORD_WEBHOOK, {
      embeds: [{
        title: '💰 PIX RECEBIDO - Nova Paulista RP',
        color: 3066993,
        fields: [
          { name: 'Valor', value: `R$ ${valor}`, inline: true },
          { name: 'Pagador', value: pagador, inline: true },
          { name: 'TxID', value: txid || 'N/A', inline: false }
        ],
        timestamp: new Date().toISOString()
      }]
    });
  } catch(e){
    console.error('Erro Discord:', e.message);
  }
  res.status(200).send('200');
});

app.get('/', (req,res)=> res.send('Webhook EFI mTLS online - use /webhook-pix'));

// Carrega chain da EFI
let efiChain;
try {
  efiChain = fs.readFileSync('./efi-chain.crt');
} catch(e){
  console.log('efi-chain.crt nao encontrado, baixando instrucao no README');
  efiChain = '';
}

const options = {
  // Render precisa de cert do servidor - usamos o p12 da EFI como server cert temporario
  // OU gere um self-signed. Para mTLS funcionar, o mais simples é usar pfx da EFI mesmo
  pfx: fs.readFileSync('./certificado.p12'),
  passphrase: process.env.CERT_PASSPHRASE || '',
  ca: efiChain,
  requestCert: true,
  rejectUnauthorized: false
};

const PORT = process.env.PORT || 3000;

https.createServer(options, (req, res) => {
  if (!req.client.authorized) {
    console.log('>> EFI teste 1 - sem certificado - RECUSANDO (correto)');
    res.writeHead(401);
    return res.end('mTLS required');
  }
  console.log('>> EFI teste 2 - com certificado - ACEITANDO');
  return app(req, res);
}).listen(PORT, () => console.log('Servidor mTLS rodando na porta ' + PORT));
