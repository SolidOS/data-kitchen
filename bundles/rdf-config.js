const UI = panes.UI
const $rdf = UI.rdf
const dom = document
var kb = UI.store;

class RDFconfig {

  constructor(){
    return this
  }
  get(fieldName){
    const values = this.kb.statementsMatching(
      this.ns('Settings'), this.ns(fieldName), null 
    ).map( stm => stm.object.value )
    return (values.length===1) ? values[0] : values
  }
  asJS(subject){
    const cfg = {}
    subject = subject || this.ns('Settings')
    const fields = this.kb.statementsMatching( subject ).map( stm=>{
      const field = stm.predicate
      const fieldName = field.uri.replace(/.*#/,'')
      const values = this.kb.statementsMatching( subject, field )
      const first = values[0].object.value
      if(values.length===1 && !first.match(this.formDoc.uri) ) 
        cfg[fieldName]=first
      else {
        let ary =[]
        for(let v in values){
          ary.push( this.asJS(values[v].object) )
        }
        cfg[fieldName]=ary
      }
    })
    return cfg
  }
  async editSettings(formDocURI){
    await this.loadSettings(formDocURI)
    await this.showForm()
    this.styleForm()
  }
  async init(formDocURI){
    this.formDoc = $rdf.sym(formDocURI)
    this.ns = $rdf.Namespace( formDocURI+"#" )
    this.kb = kb
  }
  async loadSettings(formDocURI){
    this.init(formDocURI)
    const fetcher = $rdf.fetcher(this.kb)
    if (!kb.holds(null,null,null,this.formDoc)) {
      try {
        await fetcher.load(this.formDoc)
        return this.asJS()
      }
      catch(e) { alert("Fetcher Error : "+e) }
    }
    else {
      return this.asJS()
    }
  }
  showForm(formDocURI){
    this.formContainer = document.getElementById('UIformContainer')
    if(!this.formContainer) return alert(
      "You must have an HTML element with the id UIformContainer!"
    )
    this.formContainer.innerHTML=""
    let titleSym = kb.sym('http://purl.org/dc/elements/1.1/title') 
    let title = kb.any( this.ns('Form'), titleSym )
    title = title ? title.value : this.ns('Form')
    let titleContainer = document.createElement('h2')
    titleContainer.style.width="100%"
    titleContainer.innerHTML=title
    this.formContainer.appendChild(titleContainer)
    try {
      UI.widgets.appendForm(
        document,
        this.formContainer,
        {},
        this.ns('Settings'),
        this.ns('Form'), // formNode,
        this.formDoc,
        async (ok,msg) => { 
          if(!ok) console.log("Append-form Error : "+msg) 
          else{
            this.styleForm()
          }
        }
      )
    }
    catch(e){ console.log("Append-form Error : "+e) }
  }
  styleForm(){
    let fieldValues = document.getElementsByClassName('formFieldValue')
    for(var t of fieldValues){
      t.style.textAlign="left"
      let input = t.firstChild
      if(!input.type==="text") continue
      input.style.width = input.style.textAlign==="right" ? "5em" : "60vw"
    }
    let fieldNames = document.getElementsByClassName('formFieldName')
    for(var n of fieldNames){
      let a = n.firstChild
      a.href="javascript:null()"
      a.style.color="black"
      a.style.cursor="text"
    }
  }
}
if(typeof module !="undefined") module.exports = new RDFconfig()
