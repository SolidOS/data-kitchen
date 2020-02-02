/*
fileManager    form   file-management form
sparqlQuery    form   sparql-query form
webBrowser     iframe remote or localhost web page
dataBrowser    div
  outline      table  dataBrowser
  localBrowser div    local file webpage
*/

async function manageFiles(e) {
  let r;
  e.preventDefault()
  let c={} 
  c.action = getRadioVal( document.getElementById('fileManager'), 'action' );
  c.acl = getRadioVal( document.getElementById('fileManager'), 'acl' );
  c.merge = getRadioVal( document.getElementById('fileManager'), 'merge' );
  c.sourceUri = document.getElementById('sourceUri').value
  c.targetUri = document.getElementById('targetUri').value
  if(c.action==="delete"){
    if(!c.sourceUri){
      alert("Sorry, you must specify a source URI!")
    }
    else {
      r = window.confirm(`Are you sure you want to delete ${c.sourceUri}?`)
      if(!r) return false
      console.log( `fc.delete('${c.sourceUri}')`)
    }
  }
  else if(c.action==="copy"||c.action==="move"){
    if(!(c.sourceUri && c.targetUri )){
      alert("Sorry, you must specify a source and a target!")
    }
    else {
      r = window.confirm(
        `Are you sure you want to ${c.action} ${c.sourceUri} to ${targetUri}?`
      )
      if(!r) return false
      let opts = {}
      if(c.merge==="source") opts.merge = "keep_source"
      if(c.merge==="target") opts.merge = "keep_target"
      if(c.acl==="no") opts.withAcl = false
      console.log( `fc.${c.action}('${c.sourceUri}','${c.targetUri},{}')`)
      console.log( opts )
    }
  }
  return false;
  function getRadioVal(form, name) {
    var val;
    var radios = form.elements[name];
    for (var i=0, len=radios.length; i<len; i++) {
      if ( radios[i].checked ) {
        val = radios[i].value;
        break;
      }
    }
    return val;
  }
}
