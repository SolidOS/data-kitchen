import{$t as e,Xt as t,rn as n}from"./pwa-viewport-ogKbF51K.js";var r;(r=typeof globalThis<`u`?globalThis:typeof window<`u`?window:void 0)!=null&&r.__PREACT_DEVTOOLS__&&r.__PREACT_DEVTOOLS__.attachPreact(`10.29.2`,n,{Fragment:e,Component:t});var i={};function a(){i={}}function o(t){return t.type===e?`Fragment`:typeof t.type==`function`?t.type.displayName||t.type.name:typeof t.type==`string`?t.type:`#text`}var s=[],c=[];function l(){return s.length>0?s[s.length-1]:null}var u=!0;function d(t){return typeof t.type==`function`&&t.type!=e}function f(e){for(var t=[e],n=e;n.__o!=null;)t.push(n.__o),n=n.__o;return t.reduce(function(e,t){e+=`  in `+o(t);var n=t.__source;return n?e+=` (at `+n.fileName+`:`+n.lineNumber+`)`:u&&console.warn(`Add @babel/plugin-transform-react-jsx-source to get a more detailed component stack. Note that you should not add it to production builds of your App for bundle size reasons.`),u=!1,e+`
`},``)}var p=typeof WeakMap==`function`;function m(e){var t=[];return e.__k&&e.__k.forEach(function(e){e&&typeof e.type==`function`?t.push.apply(t,m(e)):e&&typeof e.type==`string`&&t.push(e.type)}),t}function h(e){return e?typeof e.type==`function`?e.__==null?e.__e!=null&&e.__e.parentNode!=null?e.__e.parentNode.localName:``:h(e.__):e.type:``}var g=t.prototype.setState;function _(e){return e===`table`||e===`tfoot`||e===`tbody`||e===`thead`||e===`td`||e===`tr`||e===`th`}t.prototype.setState=function(e,t){return this.__v==null&&this.state==null&&console.warn(`Calling "this.setState" inside the constructor of a component is a no-op and might be a bug in your application. Instead, set "this.state = {}" directly.

`+f(l())),g.call(this,e,t)};var v=/^(address|article|aside|blockquote|details|div|dl|fieldset|figcaption|figure|footer|form|h1|h2|h3|h4|h5|h6|header|hgroup|hr|main|menu|nav|ol|p|pre|search|section|table|ul)$/,y=t.prototype.forceUpdate;function b(e){var t=e.props,n=o(e),r=``;for(var i in t)if(t.hasOwnProperty(i)&&i!==`children`){var a=t[i];typeof a==`function`&&(a=`function `+(a.displayName||a.name)+`() {}`),a=Object(a)!==a||a.toString?a+``:Object.prototype.toString.call(a),r+=` `+i+`=`+JSON.stringify(a)}var s=t.children;return`<`+n+r+(s&&s.length?`>..</`+n+`>`:` />`)}t.prototype.forceUpdate=function(e){return this.__v==null?console.warn(`Calling "this.forceUpdate" inside the constructor of a component is a no-op and might be a bug in your application.

`+f(l())):this.__P??console.warn(`Can't call "this.forceUpdate" on an unmounted component. This is a no-op, but it indicates a memory leak in your application. To fix, cancel all subscriptions and asynchronous tasks in the componentWillUnmount method.

`+f(this.__v)),y.call(this,e)},n.__m=function(e,t){var n=e.type,r=t.map(function(e){return e&&e.localName}).filter(Boolean);console.error(`Expected a DOM node of type "`+n+`" but found "`+r.join(`, `)+`" as available DOM-node(s), this is caused by the SSR'd HTML containing different DOM-nodes compared to the hydrated one.

`+f(e))},function(){(function(){var e=n.__b,t=n.diffed,r=n.__,i=n.vnode,a=n.__r;n.diffed=function(e){d(e)&&c.pop(),s.pop(),t&&t(e)},n.__b=function(t){d(t)&&s.push(t),e&&e(t)},n.__=function(e,t){c=[],r&&r(e,t)},n.vnode=function(e){e.__o=c.length>0?c[c.length-1]:null,i&&i(e)},n.__r=function(e){d(e)&&c.push(e),a&&a(e)}})();var e=!1,t=n.__b,r=n.diffed,a=n.vnode,l=n.__r,u=n.__e,g=n.__,y=n.__h,x=p?{useEffect:new WeakMap,useLayoutEffect:new WeakMap,lazyPropTypes:new WeakMap}:null,S=[];n.__e=function(e,t,n,r){if(t&&t.__c&&typeof e.then==`function`){var i=e;e=Error(`Missing Suspense. The throwing component was: `+o(t));for(var a=t;a;a=a.__)if(a.__c&&a.__c.__c){e=i;break}if(e instanceof Error)throw e}try{(r||={}).componentStack=f(t),u(e,t,n,r),typeof e.then!=`function`&&setTimeout(function(){throw e})}catch(e){throw e}},n.__=function(e,t){if(!t)throw Error(`Undefined parent passed to render(), this is the second argument.
Check if the element is available in the DOM/has the correct id.`);var n;switch(t.nodeType){case 1:case 11:case 9:n=!0;break;default:n=!1}if(!n){var r=o(e);throw Error(`Expected a valid HTML node as a second argument to render.	Received `+t+` instead: render(<`+r+` />, `+t+`);`)}g&&g(e,t)},n.__b=function(n){var r=n.type;if(e=!0,r===void 0)throw Error(`Undefined component passed to createElement()

You likely forgot to export your component or might have mixed up default and named imports`+b(n)+`

`+f(n));if(typeof r==`object`&&r)throw r.__k!==void 0&&r.__e!==void 0?Error(`Invalid type passed to createElement(): `+r+`

Did you accidentally pass a JSX literal as JSX twice?

  let My`+o(n)+` = `+b(r)+`;
  let vnode = <My`+o(n)+` />;

This usually happens when you export a JSX literal and not the component.

`+f(n)):Error(`Invalid type passed to createElement(): `+(Array.isArray(r)?`array`:r));if(n.ref!==void 0&&typeof n.ref!=`function`&&typeof n.ref!=`object`&&!(`$$typeof`in n))throw Error(`Component's "ref" property should be a function, or an object created by createRef(), but got [`+typeof n.ref+`] instead
`+b(n)+`

`+f(n));if(typeof n.type==`string`){for(var a in n.props)if(a[0]===`o`&&a[1]===`n`&&typeof n.props[a]!=`function`&&n.props[a]!=null)throw Error(`Component's "`+a+`" property should be a function, but got [`+typeof n.props[a]+`] instead
`+b(n)+`

`+f(n))}if(typeof n.type==`function`&&n.type.propTypes){if(n.type.displayName===`Lazy`&&x&&!x.lazyPropTypes.has(n.type)){var s=`PropTypes are not supported on lazy(). Use propTypes on the wrapped component itself. `;try{var c=n.type();x.lazyPropTypes.set(n.type,!0),console.warn(s+`Component wrapped in lazy() is `+o(c))}catch{console.warn(s+`We will log the wrapped component's name once it is loaded.`)}}var l=n.props;n.type.__f&&delete(l=function(e,t){for(var n in t)e[n]=t[n];return e}({},l)).ref,function(e,t,n,r,a){Object.keys(e).forEach(function(n){var o;try{o=e[n](t,n,r,`prop`,null,`SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED`)}catch(e){o=e}o&&!(o.message in i)&&(i[o.message]=!0,console.error(`Failed prop type: `+o.message+(a&&`
`+a()||``)))})}(n.type.propTypes,l,0,o(n),function(){return f(n)})}t&&t(n)};var C,w=0;n.__r=function(t){l&&l(t),e=!0;var n=t.__c;if(n===C?w++:w=1,w>=25)throw Error(`Too many re-renders. This is limited to prevent an infinite loop which may lock up your browser. The component causing this is: `+o(t));C=n},n.__h=function(t,n,r){if(!t||!e)throw Error(`Hook can only be invoked from render methods.`);y&&y(t,n,r)};var T=function(e,t){return{get:function(){var n=`get`+e+t;S&&S.indexOf(n)<0&&(S.push(n),console.warn(`getting vnode.`+e+` is deprecated, `+t))},set:function(){var n=`set`+e+t;S&&S.indexOf(n)<0&&(S.push(n),console.warn(`setting vnode.`+e+` is not allowed, `+t))}}},E={nodeName:T(`nodeName`,`use vnode.type`),attributes:T(`attributes`,`use vnode.props`),children:T(`children`,`use vnode.props.children`)},D=Object.create({},E);n.vnode=function(e){var t=e.props;if(e.type!==null&&t!=null&&(`__source`in t||`__self`in t)){var n=e.props={};for(var r in t){var i=t[r];r===`__source`?e.__source=i:r===`__self`?e.__self=i:n[r]=i}}e.__proto__=D,a&&a(e)},n.diffed=function(t){var n,i=t.type,a=t.__;if(t.__k&&t.__k.forEach(function(e){if(typeof e==`object`&&e&&e.type===void 0){var n=Object.keys(e).join(`,`);throw Error(`Objects are not valid as a child. Encountered an object with the keys {`+n+`}.

`+f(t))}}),t.__c===C&&(w=0),typeof i==`string`&&(_(i)||i===`p`||i===`a`||i===`button`)){var s=h(a);if(s!==``&&_(i))i===`table`&&s!==`td`&&_(s)?console.error(`Improper nesting of table. Your <table> should not have a table-node parent.`+b(t)+`

`+f(t)):i!==`thead`&&i!==`tfoot`&&i!==`tbody`||s===`table`?i===`tr`&&s!==`thead`&&s!==`tfoot`&&s!==`tbody`?console.error(`Improper nesting of table. Your <tr> should have a <thead/tbody/tfoot> parent.`+b(t)+`

`+f(t)):i===`td`&&s!==`tr`?console.error(`Improper nesting of table. Your <td> should have a <tr> parent.`+b(t)+`

`+f(t)):i===`th`&&s!==`tr`&&console.error(`Improper nesting of table. Your <th> should have a <tr>.`+b(t)+`

`+f(t)):console.error(`Improper nesting of table. Your <thead/tbody/tfoot> should have a <table> parent.`+b(t)+`

`+f(t));else if(i===`p`){var c=m(t).filter(function(e){return v.test(e)});c.length&&console.error(`Improper nesting of paragraph. Your <p> should not have `+c.join(`, `)+` as child-elements.`+b(t)+`

`+f(t))}else i!==`a`&&i!==`button`||m(t).indexOf(i)!==-1&&console.error(`Improper nesting of interactive content. Your <`+i+`> should not have other `+(i===`a`?`anchor`:`button`)+` tags as child-elements.`+b(t)+`

`+f(t))}if(e=!1,r&&r(t),t.__k!=null)for(var l=[],u=0;u<t.__k.length;u++){var d=t.__k[u];if(d&&d.key!=null){var p=d.key;if(l.indexOf(p)!==-1){console.error(`Following component has two or more children with the same key attribute: "`+p+`". This may cause glitches and misbehavior in rendering process. Component: 

`+b(t)+`

`+f(t));break}l.push(p)}}if(t.__c!=null&&t.__c.__H!=null){var g=t.__c.__H.__;if(g)for(var y=0;y<g.length;y+=1){var x=g[y];if(x.__H){for(var S=0;S<x.__H.length;S++)if((n=x.__H[S])!=n){var T=o(t);console.warn(`Invalid argument passed to hook. Hooks should not be called with NaN in the dependency array. Hook index `+y+` in component `+T+` was called with NaN.`)}}}}}}();export{l as getCurrentVNode,o as getDisplayName,f as getOwnerStack,a as resetPropWarnings};
//# sourceMappingURL=debug.module-YFQgwnIr.js.map