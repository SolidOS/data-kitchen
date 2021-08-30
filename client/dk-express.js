const solid = require('solid-server');
const app = require('express')();
const https = require('https');
const fs = require('fs');

const port = "9119";
const host = "https://localhost:" + port;
const sslKey = "./server/nss-privkey.pem";
const sslCert = "./server/nss-fullchain.pem";

const sslOptions = {
  key: fs.readFileSync(sslKey),
  cert: fs.readFileSync(sslCert)
};

app.use('/', solid({
  "port": port,
  "serverUri": host,
  "webid": true,
  "multiuser": true,
  "corsProxy": "/proxy",
  "mount": "/",
  "root": "./pods",
  "configPath": "./server/nss-config",
  "configFile": "./server/nss-config.json",
  "dbPath": "./server/nss-db",
  "sslKey": sslKey,
  "sslCert": sslCert,
  "server": {
    "name": "Data Kitchen",
    "description": "SolidOS as a stand-alone desktop app for private data",
    "logo": ""
  },
  "enforceToc": true,
  "disablePasswordChecks": true,
  "tocUri": "https://your-toc",
  "supportEmail": "Your support email address"
}));

app.on('error', (e) => {
  console.log(e);
});



https.createServer( sslOptions, app ).listen( port, (err)=> {
  if(err) console.log(err);
  console.log("Data-Kitchen NSS Server is listening at ",host);
})


