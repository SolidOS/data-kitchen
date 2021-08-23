var port = '3000';
var host = `http://localhost:${port}`;

window.SolidAppContext = {
  app : host,
  webid : host + "/LocalKitchenUser/profile/card#me",
  scroll : 130 // for eyeFocus, should be height of top banner
}
window.$SolidTestEnvironment = {
  iconBase : "/common/icons/",
  originalIconBase : "/common/originalIcons/",
}

