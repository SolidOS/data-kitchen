/*
import SolidRest from '/home/jeff/Public/solid/solid-rest/2.0.0/src/index.js';
import SolidRestFile from '/home/jeff/Public/solid/solid-rest/2.0.0/plugins/solid-rest-file/src/index.js';
import SolidRestDropbox from '/home/jeff/Public/solid/solid-rest/2.0.0/plugins/dropbox/src/index.js';
const fileFetcher = new SolidRest({
  plugin:new SolidRestFile(),
  parser: $rdf
});
const dropboxFetcher = new SolidRest({
  plugin:new SolidRestDropbox(),
});
*/
import { SolidRestFile } from '@solid-rest/file';
import { SolidRestDropbox } from '@solid-rest/dropbox';
const fetcher = {
  'file' : new SolidRestFile(),
  'dropbox' :  new SolidRestDropbox(),
};

import express from 'express';
import {URL} from "url";
import fs from 'fs';
import bodyParser from 'body-parser';
import libPath from 'path'
import * as $rdf from 'rdflib';

const port = process.argv[2] || 7000;    // PORT
const host = "http://127.0.0.1:" + port  // HOSTNAME
const base = `${process.cwd()}/myPod`    // LOCAL FILE SYSTEM POD HOME

const app  = express()
app.use(bodyParser.json({extended:true}));
app.use(bodyParser.raw({extended:true}));
app.use(bodyParser.text({extended:true}));
app.use(bodyParser.urlencoded({extended:true}));
app.use( '/', express.static( base,{
  index:false,
  extensions:['ttl'],
  setHeaders: (res, requestPath) => {
    let noExtension = !Boolean(libPath.extname(requestPath));
    if(noExtension) res.setHeader('Content-Type', 'text/html');
  }
}));

const isSpecialUrl = { "/private/":1, "/profile/":1, "/profile/card":1, "/public/":1, "/settings/":1, "/.well-known/":1, "/.acl":1,"/favicon.ico":1, };
const dkTemplate = await getTemplate('data-kitchen.tmpl',port,'core');

app.all('/*', async function (req, res,next) {
  // DENY ALL EXTERNAL REQUESTS BASED ON SOCKET CONNECTION
  // SHOULD ALREADY BE BLOCKED IN HOSTS FILE, BUT JUST IN CASE
  var origin = req.connection.remoteAddress;
  if(!origin.match(/^(127.0.0.1)|(::ffff:127.0.0.1)|(::1)$/)){
    res.append('status',400);
    res.append('statusText',"Bad Request!");
    console.log("Attempt to access from external source!!!!!!!");
    return res.send();
  }
  let path = req.path
  let pathAry = req.path.split('/');
  pathAry.shift();  // remove first slash
  let type = pathAry.shift();
  path = "/" + pathAry.join('/');
  if(req.path === '/')  { 
    path = base + path;
  }
  if(path === '/profile/card')  path = path + ".ttl";
  if( isSpecialUrl[req.path] )      path = base + path
  if( req.path.startsWith('/common') ) path = base + path
//  if( req.path.match(/\.tmpl$/) ) handleTemplate( req, res ); else
//  if(!type || type==='file' || type==="text") {
    return restRequest(type,path,req,res);
//  }
})

app.listen(port, () => {
  console.log(`Open <${host}/dk> in your browser`);
})

async function doRoot( req, res ){
  // Don't delete or overwrite root
  //
  if( !req.method.match(/GET|HEAD|OPTIONS/) ){
    let msg = 'Cowardly refusing to change the root container!';
    console.log(msg);
    res.append('status',500);
    res.append('statusText',msg);
    res.send();
    return;
  }
  //  return sendTemplate( dkTemplate, res );
  return res.sendFile( base + '/common/html/data-kitchen.html' );
}

// COMMUNICATION WITH SOLID REST
//
function restRequest(type, path,req,res) {
  type=type||'file';
  req.plainResponse=1;
  req.typeWanted=type;
  let url = new URL( `${type}://${path}` );
  if( path.startsWith('/login/') ){
    console.log("logging in to ",type)
    let token = path.replace('/login/','')
    fetcher[type].login( token).then( async(response)=>{
      if(response && !response.status) { 
        console.log("logged in!")
        restRequest(type,'/',req,res) 
      }
      else restResponse(response,path,req,res,url);
    })
    return;    
  }
  else {
    fetcher[type].fetch( url.href, req ).then( async(response)=>{
      restResponse(response,path,req,res,url)
    })
    return;    
  }
}
function restResponse(response,path,req,res,url) {
  let status="",statusText="";
  for(var h in response.headers){
    if(h==='status') status = response.headers[h];
    if(h==='statusText') statusText = response.headers[h];
    if(h==='content-type' && path.endsWith('/') ) response.headers[h]='text/turtle'; 
    res.set(h,response.headers[h])
  }
  console.log( "%s %s %s %s", req.method, url.href, status, statusText );
  res.set("Connection", "close");
  res.send( response.body );
}

// TEMPLATE HANDLING
//

async function handleTemplate( req,res ){
//  let templateName = req.path.replace('/templates/','');
  let templateName = req.path
  let templateContent = await getTemplate(templateName,port);
  if(!templateContent ){
    console.log('No template!');
    res.append('status',500);
    res.append('statusText','No template!');
    res.send()
  }
  else return sendTemplate( templateContent, res )
}

async function getTemplate( templateName, port ){
  // console.log('getting template '+templateName);
  let templateType;
  try {
/*
    if( templateName.match('Browser') ){
      templateType = templateName.substr(1,4)
      templateType = templateType==="file" ?`{username:"${host}/profile/card#me"}` : null;
      templateName = 'fileBrowser.tmpl'
    }
*/
    let path = base + "/../templates/" + templateName //+ ".tmpl";
    // console.log( 'as '+path );
    let content;
    try { content = await fs.readFileSync(path,'utf-8') } catch(e){}
    if(!content) return null;
    content = content.replace(/\$\{host\}/g,'http://localhost:' + port);
    content = content.replace(/\$\{browserType\}/g,templateType);
    return content
  } catch(e) { console.log(e) }
}
function sendTemplate( content, res ){
    res.append('status',200);
    res.append('content-type','text/html');
    res.set("connection", "close");
    res.send(content)
}

