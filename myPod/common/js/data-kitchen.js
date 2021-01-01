class DataKitchen {

  constructor(){
    this.input = document.getElementById("mainInput");
    this.spaces = ['text','file','pod','pod2','pod3','dropbox','ssh','ontology','rss','music','ocb'];
    let spaces = localStorage.getItem('data-kitchen');
    this.space = (spaces) ? JSON.parse(spaces) : {
      text : {
        type     : 'text',
        selected : 1,
        label    : "Help & Resources",
        url      : "/common/html/info-space.html",     
      },
      file : {
        type     : 'file',
        showTab  : 1,
        label    : "Local Files",
        url      : "/common/html/launcher.html?type=file",     
        holder   : "e.g. /home/talisha/stuff/",
        prompt   : "File path",
      },
      pod : {
        type     : 'pod',
        label    : "Solid Pods",
        url      : "/common/html/launcher.html?type=pod",     
        holder   : "e.g. https://kwame.solidcommunity.net/public/",
        prompt   : "URI",
      },
      pod2 : {
        type     : 'pod2',
        label    : "Solid Pod #2",
        url      : "/common/html/launcher.html?type=pod",     
        holder   : "e.g. https://kwame.solidcommunity.net/public/",
        prompt   : "URI",
      },
      pod3 : {
        type     : 'pod3',
        label    : "Solid Pod #3",
        url      : "/common/html/launcher.html?type=pod",     
        holder   : "e.g. https://kwame.solidcommunity.net/public/",
        prompt   : "URI",
      },
      dropbox : { 
        label : "Dropbox", 
        url      : "/common/html/launcher.html?type=dropbox",     
      },
      ssh : {
        label : "SSH", 
        url      : "/common/html/launcher.html?type=ssh",     
        prompt   : "SSH path",
        holder   : "e.g. /home/maria/stuff/",
      },
      ontology : { label : "Ontologies" },
      rss : { label : "News" },
      music : { label : "Music" },
      ocb : { label : "Culture" },
    }
    this.makeSpaceManagerTab()
    for(var s of this.spaces) this.makeSpace(s);
    this.showSpaces();
  } // DataKitchen constructor

    getSpaceVar(type,key){
      if(type==='selected') return this.selectedSpace;
      return this.space[type][key]; 
    }

    dispatchUrl(type,enteredUrl){
      let urlToLaunch = enteredUrl;
      if(!type.match('pod')){
        urlToLaunch = `/${type}${enteredUrl}`;      
      }
      this.selectedSpace = type;
      // this.space[type].lastVisited = urlToLaunch;
      localStorage.setItem('data-kitchen',JSON.stringify(this.space));
      return urlToLaunch;
    }

    getTabsShowing(){
      let tabsShowing = {};
      for( var type of this.spaces ){
        if( this.space[type].showTab ) tabsShowing[type]=1;
      }
      return tabsShowing;
    }
    resetTabsShowing(tabsShowing,p1,p2,p3){
      for( var type of this.spaces ){ 
        if( tabsShowing[type] ) this.space[type].showTab=true;
        else this.space[type].showTab=false;
      }
      if(p1){
        this.space['pod'].label = p1;
        this.space['pod'].tab.firstChild.innerHTML = p1;
      }
      if(p2){
        this.space['pod2'].label = p2;
        this.space['pod2'].tab.firstChild.innerHTML = p2;
      }
      if(p3){
        this.space['pod3'].label = p3;
        this.space['pod3'].tab.firstChild.innerHTML = p3;
      }
      localStorage.setItem('data-kitchen',JSON.stringify(this.space));
      this.showSpaces();
    }

   showSpaces(){
    for(var space of this.spaces){
      let s = this.space[space];
      if( s.selected ){
        this.selectedSpace = space;
        s.tab.style.fontWeight="bold";
        s.tab.style.color="black !important";
        s.tab.style.backgroundColor="white !important";
        s.frame.style.display="block";
      }
      else {
        s.tab.style.fontWeight="normal";
        s.tab.style.color="blue";
        s.tab.style.backgroundColor="#ddd";
        s.frame.style.display="none";
      }
      if( s.showTab ){
        s.tab.style.display="block";
      }
      else {
        s.tab.style.display="none";
      }

    }
  }

  switchSpaces( wantedType,url){
    for(var type of this.spaces){
      if( this.space[type].type===wantedType ) {
        this.space[type].selected = true;
        this.space[type].url = url || this.space[type].url;
        if(type==="text") this.space.text.frame.src = this.space.text.url;
      }
      else this.space[type].selected = false;
    }
    this.showSpaces()
  }

  makeSpaceManagerTab(){
    let tabs = document.getElementById('tabs-list');
    let newTab = document.createElement('LI');
    let anchor = document.createElement('A');
    anchor.innerHTML=`<img src="https://solid.github.io/solid-ui/src/icons/noun_34653_green.svg">`
    anchor.href = `javascript:dkv().switchSpaces('text','/common/html/info-space.html')`;
    anchor.title = 'Add an Information Source';
    newTab.appendChild(anchor);
    tabs.appendChild( newTab );
  }

  makeSpace(type){
    let tabs = document.getElementById('tabs-list');
    let iframes = document.getElementById('frames-list');
    let newTab = document.createElement('LI');
    let anchor = document.createElement('A');
    let newFrame = document.createElement('iframe');
    anchor.innerHTML=this.space[type].label;
    anchor.href = `javascript:dkv().switchSpaces('${type}')`;
    newTab.appendChild(anchor);
    newTab.id = type+'Tab';
    newFrame.id = type+'Frame';
    tabs.appendChild( newTab );
    iframes.appendChild( newFrame );
    this.space[type].tab =  document.getElementById(type+'Tab');
    this.space[type].frame = document.getElementById(type+'Frame');
    this.space[type].url = this.space[type].url || "/common/html/launcher.html?type="+type,     
    this.space[type].holder = this.space[type].holder || type + " path e.g. /home/maria/stuff/",
    this.space[type].type = this.space[type].type || type;
    this.space[type].frame.src = this.space[type].url;
  }

} // class DataKitchen


