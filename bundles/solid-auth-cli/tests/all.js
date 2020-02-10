const SolidAuthCli  = require("../")
const Rest          = require("../../solid-rest")
const File          = require("../../solid-rest/src/file.js")
const Mem           = require("../../solid-rest/src/localStorage.js")

const rest = new Rest([  new Mem(), new File() ])
const auth = new SolidAuthCli( rest )

let [tests,fails,passes,res] = [0,0,0]

async function main(){
  await run("app:")
  await run("file:")
  await run("https:")
}
main()

async function getConfig(scheme){
  if(scheme==="app:")       scheme = "app://ls"
  else if(scheme==="file:") scheme = "file://" + process.cwd()

  else if(scheme==="https:") {

   let session = await auth.login()
   let webId = session.webId
   if(! webId ) throw "Couldn't login!"
    scheme = webId.replace("/profile/card#me",'')+"/public"
  }

  /*
   * we assume that test-folder exists and is empty
  */
  let  base   = scheme + "/test-folder"
  let  c1name = "rest/"
  let  c2name = "deep-folder"
  let  r1name = "test1.ttl"
  let  r2name = "test2.ttl"
  let  folder1 = base +"/"+ c1name
  let  folder2 =  folder1 + c2name + "/"
  let  deepR  =  folder2 +"test-file2.ttl"
  let  file1  = folder1 + r1name
  let  file2  = folder2 + r2name
  let  missingFolder = base + "/noSuchThing/norThis/"
  let cfg =  {
    base   : base,
    c1name : c1name,
    c2name : c2name,
    r1name : r1name,
    r2name : r2name,
    folder1 : folder1,
    folder2 : folder2,
    deepR  :  deepR,
    file1  : file1,
    file2  : file2,
    missingFolder : missingFolder,
    text   : "<> a <#test>.",
  }
  return(cfg)
}

async function run(scheme){


  [tests,fails,passes] = [0,0,0]
  let cfg = await getConfig(scheme)
  let res

  /* CREATE TEST FOLDER ON APP */
  if(scheme==="app:") {
    res = await postFolder("app://ls/","test-folder")
    cfg.base += "/";
  }

  console.log(`\nTesting ${cfg.base} ...`)

  res = await postFolder( cfg.base,cfg.c1name )
  ok( "400 post container with trailing slash on slug", res.status==400,res)

  cfg.c1name = cfg.c1name.replace(/\/$/,'')

  res = await postFolder( cfg.base,cfg.c1name )
  ok( "201 post container", (res.status==201 || res.status==200),res)

  res = await postFolder( cfg.base,cfg.c1name )
  ok( "201 post container, container found", (res.status==201 || res.status==200),res)

  res = await postFolder( cfg.missingFolder,cfg.c2name )
  ok( "404 post container, parent not found", res.status==404,res)

  res = await postFile( cfg.folder1,cfg.r1name,cfg.text )
  ok( "201 post resource", res.status==201 || res.status == 200,res)

  res = await postFile( cfg.folder1,cfg.r1name,cfg.txt )
  ok( "201 post resource, resource found", res.status==201 || res.status==200,res)

  res = await postFile( cfg.missingFolder,cfg.file2 )
  ok( "404 post resource, parent not found", res.status==404,res)

  res = await PUT( cfg.folder1 )
  ok( "409 put container (method not allowed)", res.status==409,res)

  res = await PUT( cfg.file1,cfg.text )
  ok( "201 put resource", res.status==201 || res.status==200,res)

  res = await PUT( cfg.file1,cfg.text )
  ok( "201 put resource, resource found", res.status==201 || res.status==200,res)

  res = await PUT( cfg.deepR,cfg.text )
  ok("201 put resource, parent not found (recursive creation)",res.status==201 || res.status==200)

  res = await HEAD( cfg.deepR )
  ok("200 head", res.status==200 && res.headers.get("allow"),res )

  res = await HEAD( cfg.missingFolder )
  ok("404 head resource, not found",res.status==404,res )

  res = await GET( cfg.missingFolder )
  ok("404 get container, not found",res.status==404,res )

  res = await GET( cfg.file1 )
  ok("200 get resource", res.status==200 && await res.text()===cfg.text)

  res = await GET( cfg.folder1 )
  let type = res.headers.get("content-type")

  ok("200 get container",res.status==200 && type==="text/turtle",res)

  res = await DELETE( cfg.folder1 )
  ok("409 delete container, not empty",res.status==409,res)

  res = await DELETE( cfg.file1 )
  res = await DELETE( cfg.deepR )
  ok("200 delete resource",res.status==200,res)

  if(scheme != "https:"){
    res = await DELETE( cfg.folder2 )
    res = await DELETE( cfg.folder1 )
    ok("200 delete container",res.status==200,res)
  }

  console.log(`${passes}/${tests} tests passed, ${fails} failed\n`)

}
/* =========================================================== */
/* REST METHODS                                                */
/* =========================================================== */
async function GET(url){
  return await auth.fetch( url, {method:"GET"} )
}
async function HEAD(url){
  return await auth.fetch( url, {method:"HEAD"} )
}
async function PUT(url,text){
  return await auth.fetch( url, {method:"PUT",body:text,headers:{"content-type":"text/turtle"}} )
}
async function DELETE(url){
  return await auth.fetch( url, {method:"DELETE"} )
}
async function POST(parent,item,content,link){
  return await auth.fetch( parent,{
    method:"POST",
    headers:{slug:item,link:link,"content-type":"text/turtle"},
    body:content
  })
}
async function postFile(parent,file,content){
  let link = '<http://www.w3.org/ns/ldp#Resource>; rel="type"'
  return POST(parent,file,content,link)
}
async function postFolder(parent,folder){
  let link ='<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"'
  return POST(parent,folder,'',link)
}

/* ============================================== */

function ok( label, success,res ){
   tests = tests + 1;   
   if(success) passes = passes + 1
   else fails = fails+1
   let msg = success ? "ok " : "FAIL "
   console.log( "  " + msg + label)
   if(!success && res ) console.log(res.status,res.statusText)
   return success
}

