"use strict";

const nodeFetch       = require('node-fetch');
const SolidClient     = require('@solid/cli/src/SolidClient');
const IdentityManager = require('@solid/cli/src/IdentityManager');
const fs              = require('fs');
const path            = require('path');
const Rest            = require('solid-rest');
const File            = require('solid-rest/src/file.js');
const Mem             = require('solid-rest/src/localStorage.js');

module.exports = class SolidAuthCli {

  constructor( restObject ){
    this.rest = restObject || new Rest([ new File(), new Mem() ])
    this.session = null
    this.client = new SolidClient({ identityManager : new IdentityManager() });
    return this
  }

  async fetch(url,request){
    if( url.match(/^(file:|app:)/) ){
        return await this.rest.fetch(url,request)        
    }
    request = request || {};
    request.method = request.method || 'GET';
    request.headers = request.headers || {};
    if( this.session ) {
      let token = await this.client.createToken(url, this.session);
      request.credentials = "include";
      request.headers.authorization= `Bearer ${token}`;
    }
    return nodeFetch(url,request);
  }

  async logout() {
    this.session = undefined;    
    return(1);
  }

  async currentSession(){
    if (this.session && !this.client.isExpired(this.session)) return(this.session)
    else { return null; }
  }

  async login( cfg ) {
    if( typeof cfg==="string" ) cfg=undefined // s-a-client compatability 
    cfg = cfg || await this.getCredentials()
    if(typeof cfg.password === "undefined"){
      throw new Error("Couldn't find login config, please specify environment variables SOLID_IDP, SOLID_USERNAME, and SOLID_PASSWORD or see the README for solid-auth-cli for other login options.");
    }
    this.session = await this.client.login(
      cfg.idp,{username:cfg.username,password:cfg.password}
    )
    if(this.session) {
      this.session.webId = this.session.idClaims.sub
      return(this.session);
    }
    else {
      throw new Error("could not log in")
    }
  }

  async getCredentials(fn){
    fn = fn || path.join(process.env.HOME,".solid-auth-cli-config.json")
    var creds={};
    if(fs.existsSync(fn))  {
      try {
        creds = fs.readFileSync(fn,'utf8');
      } catch(err) { throw new Error("read file error "+err) }
      try {
        creds = JSON.parse( creds );
        if(!creds) throw new Error("JSON parse error : "+err)
      }
      catch(err) { throw new Error("JSON parse error : "+err) }
    }
    else {
      creds = {
        idp      : process.env.SOLID_IDP,
        username : process.env.SOLID_USERNAME,
        password : process.env.SOLID_PASSWORD
      } 
    }
    return(creds)
  }

}

