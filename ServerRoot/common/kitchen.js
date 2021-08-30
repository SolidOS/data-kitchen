var port =3100;

var host = `http://localhost:${port}`;

window.SolidAppContext = {
  noAuth : host,
  webId : host + "/LocalKitchenUser/profile/card#me",
  app : host,
  webid : host + "/LocalKitchenUser/profile/card#me",
  scroll : 130 // for eyeFocus, should be height of top banner
}
window.$SolidTestEnvironment = {
  iconBase : "/common/icons/",
  originalIconBase : "/common/originalIcons/",
}
