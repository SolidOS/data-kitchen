module.exports = function(variables) {
function getVariableValue(name) {
  if (!variables || !(name in variables)) {
    throw new Error('Undefined variable: ' + name);
  }
  return variables[name];
}
const urn_solid_server_default_ErrorToJsonConverter = new (require('@solid/community-server').ErrorToJsonConverter)();
const urn_solid_server_default_ErrorToQuadConverter = new (require('@solid/community-server').ErrorToQuadConverter)();
const urn_solid_server_default_FormToJsonConverter = new (require('@solid/community-server').FormToJsonConverter)();
const df_1873_20 = new (require('@solid/pivot').ThrowingN3Patcher)();
const df_1873_22 = new (require('@solid/community-server').SparqlUpdatePatcher)();
const urn_solid_server_default_StreamingHttpMap = new (require('@solid/community-server').StreamingHttpMap)();
const urn_solid_server_default_WebSocketMap = new (require('@solid/community-server').WebSocketMap)();
const urn_solid_server_default_LoggerFactory = new (require('@solid/community-server').WinstonLoggerFactory)(getVariableValue('urn:solid-server:default:variable:loggingLevel'));
const urn_solid_server_default_FileIdentifierMapper = new (require('@solid/community-server').ExtensionBasedMapper)(getVariableValue('urn:solid-server:default:variable:baseUrl'), getVariableValue('urn:solid-server:default:variable:rootFilePath'), {});
const urn_solid_server_default_IdentifierStrategy = new (require('@solid/community-server').SingleRootIdentifierStrategy)(getVariableValue('urn:solid-server:default:variable:baseUrl'));
const df_1867_0 = new (require('@solid/community-server').FilterPattern)(undefined, 'http://www.w3.org/2011/http-headers#content-length', undefined);
const df_1735_5 = new (require('@solid/community-server').SuffixAuxiliaryIdentifierStrategy)('/.internal/');
const urn_solid_server_default_AclIdentifierStrategy = new (require('@solid/community-server').SuffixAuxiliaryIdentifierStrategy)('.acl');
const df_1759_0 = new (require('@solid/community-server').EjsTemplateEngine)(getVariableValue('urn:solid-server:default:variable:baseUrl'), undefined);
const df_1759_2 = new (require('@solid/community-server').HandlebarsTemplateEngine)(getVariableValue('urn:solid-server:default:variable:baseUrl'), undefined);
const urn_solid_server_default_MetadataIdentifierStrategy = new (require('@solid/community-server').SuffixAuxiliaryIdentifierStrategy)('.meta');
const df_1873_8 = new (require('@solid/community-server').FilterPattern)(undefined, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://www.w3.org/ns/pim/space#Storage');
const df_1873_10 = new (require('@solid/community-server').FilterPattern)(undefined, 'http://www.w3.org/ns/ldp#contains', undefined);
const df_1873_12 = new (require('@solid/community-server').FilterPattern)(undefined, 'http://www.w3.org/ns/posix/stat#size', undefined);
const df_1873_14 = new (require('@solid/community-server').FilterPattern)(undefined, 'http://www.w3.org/ns/posix/stat#mtime', undefined);
const df_1873_16 = new (require('@solid/community-server').FilterPattern)(undefined, 'http://purl.org/dc/terms/modified', undefined);
const df_1873_18 = new (require('@solid/community-server').FilterPattern)(undefined, 'http://www.w3.org/ns/ma-ont#format', undefined);
const df_1873_2 = new (require('@solid/community-server').UnsupportedMediaTypeHttpError)(undefined, undefined);
const urn_solid_server_default_ClusterManager = new (require('@solid/community-server').ClusterManager)(getVariableValue('urn:solid-server:default:variable:workers'));
const urn_solid_server_default_WorkerParallelInitializer = new (require('@solid/community-server').ParallelHandler)([]);
const df_1691_4 = new (require('@solid/community-server').StaticAssetEntry)('/browse.html', './node_modules/mashlib/dist/browse.html');
const df_1691_6 = new (require('@solid/community-server').StaticAssetEntry)('/mash.css', './node_modules/mashlib/dist/mash.css');
const df_1691_8 = new (require('@solid/community-server').StaticAssetEntry)('/mashlib.js', './node_modules/mashlib/dist/mashlib.js');
const df_1691_10 = new (require('@solid/community-server').StaticAssetEntry)('/mashlib.js.map', './node_modules/mashlib/dist/mashlib.js.map');
const df_1691_12 = new (require('@solid/community-server').StaticAssetEntry)('/mashlib.min.js', './node_modules/mashlib/dist/mashlib.min.js');
const df_1691_14 = new (require('@solid/community-server').StaticAssetEntry)('/mashlib.min.js.map', './node_modules/mashlib/dist/mashlib.min.js.map');
const df_1691_16 = new (require('@solid/community-server').StaticAssetEntry)('/841.mashlib.js', './node_modules/mashlib/dist/841.mashlib.js');
const df_1691_18 = new (require('@solid/community-server').StaticAssetEntry)('/841.mashlib.map', './node_modules/mashlib/dist/841.mashlib.map');
const df_1691_20 = new (require('@solid/community-server').StaticAssetEntry)('/841.mashlib.min.js', './node_modules/mashlib/dist/841.mashlib.min.js');
const df_1691_22 = new (require('@solid/community-server').StaticAssetEntry)('/841.mashlib.min.js.map', './node_modules/mashlib/dist/841.mashlib.min.js.map');
const urn_solid_server_default_AuthResourceHttpHandler = new (require('@solid/community-server').UnsupportedAsyncHandler)(undefined);
const df_1815_2 = new (require('@solid/community-server').ExtensionBasedMapperFactory)();
const df_1775_1 = new (require('@solid/community-server').DeleteNotificationGenerator)();
const urn_solid_server_default_ETagHandler = new (require('@solid/community-server').BasicETagHandler)();
const df_1775_9 = new (require('@solid/community-server').JsonLdNotificationSerializer)();
const urn_solid_server_default_MetadataWriter_ContentType = new (require('@solid/community-server').ContentTypeMetadataWriter)();
const urn_solid_server_default_MetadataWriter_Modified = new (require('@solid/community-server').ModifiedMetadataWriter)();
const urn_solid_server_default_MetadataWriter_Range = new (require('@solid/community-server').RangeMetadataWriter)();
const urn_solid_server_default_RedirectingErrorHandler = new (require('@solid/community-server').RedirectingErrorHandler)();
const df_1825_0 = new (require('@solid/community-server').AcceptPreferenceParser)();
const df_1825_2 = new (require('@solid/community-server').RangePreferenceParser)();
const urn_solid_server_default_WebSocket2023Emitter = new (require('@solid/community-server').WebSocket2023Emitter)(urn_solid_server_default_WebSocketMap);
const df_1773_1 = new (require('@solid/community-server').AbsolutePathInteractionRoute)(getVariableValue('urn:solid-server:default:variable:baseUrl'), undefined);
const urn_solid_server_default_StreamingHttp2023Emitter = new (require('@solid/community-server').StreamingHttp2023Emitter)(urn_solid_server_default_StreamingHttpMap);
const urn_solid_server_default_StorageLocationStrategy = new (require('@solid/community-server').RootStorageLocationStrategy)(getVariableValue('urn:solid-server:default:variable:baseUrl'));
const urn_solid_server_default_MetadataWriter_WwwAuth = new (require('@solid/community-server').WwwAuthMetadataWriter)('Bearer scope="openid webid"');
const urn_solid_server_default_EmptyErrorHandler = new (require('@solid/community-server').EmptyErrorHandler)(undefined, undefined);
const urn_solid_server_default_LoggerInitializer = new (require('@solid/community-server').LoggerInitializer)(urn_solid_server_default_LoggerFactory);
const urn_solid_server_default_AtomicFileDataAccessor = new (require('@solid/community-server').AtomicFileDataAccessor)(urn_solid_server_default_FileIdentifierMapper, getVariableValue('urn:solid-server:default:variable:rootFilePath'), '/.internal/tempFiles/');
const urn_solid_server_default_SizeReporter = new (require('@solid/community-server').FileSizeReporter)(urn_solid_server_default_FileIdentifierMapper, getVariableValue('urn:solid-server:default:variable:rootFilePath'), undefined);
const df_1735_6 = new (require('@solid/community-server').ComposedAuxiliaryStrategy)(df_1735_5, undefined, undefined, undefined, undefined);
const urn_solid_server_default_MetadataStrategy = new (require('@solid/community-server').ComposedAuxiliaryStrategy)(urn_solid_server_default_MetadataIdentifierStrategy, undefined, undefined, false, false);
const urn_solid_server_default_PatchHandler_RDF = new (require('@solid/community-server').WaterfallHandler)([
  df_1873_20,
  df_1873_22
]);
const df_1873_3 = new (require('@solid/community-server').StaticThrowHandler)(df_1873_2);
const urn_solid_server_default_WorkerManager = new (require('@solid/community-server').WorkerManager)(urn_solid_server_default_ClusterManager);
const urn_solid_server_default_ContentTypeParser = new (require('@solid/community-server').ContentTypeParser)();
const urn_solid_server_default_PlainJsonLdFilter = new (require('@solid/community-server').PlainJsonLdFilter)();
const urn_solid_server_default_SlugParser = new (require('@solid/community-server').SlugParser)();
const urn_solid_server_default_ContentLengthParser = new (require('@solid/community-server').ContentLengthParser)();
const df_1827_6 = new (require('@solid/community-server').N3PatchBodyParser)();
const df_1827_8 = new (require('@solid/community-server').SparqlUpdateBodyParser)();
const df_1827_2 = new (require('@solid/community-server').RawBodyParser)();
const urn_solid_server_default_BearerWebIdExtractor = new (require('@solid/community-server').BearerWebIdExtractor)();
const urn_solid_server_default_PublicCredentialsExtractor = new (require('@solid/community-server').PublicCredentialsExtractor)();
const urn_solid_server_default_TemplateEngine = new (require('@solid/community-server').WaterfallHandler)([
  df_1759_0,
  df_1759_2
]);
const urn_solid_server_default_IdentifierGenerator = new (require('@solid/community-server').SuffixIdentifierGenerator)(getVariableValue('urn:solid-server:default:variable:baseUrl'));
const df_1949_0 = new (require('@solid/community-server').AbsolutePathInteractionRoute)(getVariableValue('urn:solid-server:default:variable:baseUrl'), undefined);
const df_1827_0 = new (require('@solid/community-server').BasicConditionsParser)(urn_solid_server_default_ETagHandler);
const df_1731_13 = new (require('@solid/community-server').UnsupportedMediaTypeHttpError)(undefined, undefined);
const df_1731_5 = new (require('@solid/community-server').MethodNotAllowedHttpError)(undefined, undefined, undefined);
const urn_solid_server_default_PermissionReader = new (require('@solid/community-server').AllStaticReader)(true);
const urn_solid_server_default_ContentTypeReplacer = new (require('@solid/community-server').ContentTypeReplacer)({
  'application/n-triples': 'text/turtle',
  'text/turtle': 'application/trig',
  'application/ld+json': 'application/json',
  'application/*': 'application/octet-stream',
  'text/*': 'application/octet-stream'
});
const urn_solid_server_default_RdfToQuadConverter = new (require('@solid/community-server').RdfToQuadConverter)({
  'https://www.w3.org/ns/solid/notification/v1': '@css:templates/contexts/notification.jsonld',
  'https://www.w3.org/ns/activitystreams': '@css:templates/contexts/activitystreams.jsonld'
});
const urn_solid_server_default_NotificationRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(df_1773_1, '/.notifications/', undefined);
const urn_solid_server_default_Middleware_Header = new (require('@solid/community-server').HeaderHandler)({
  'Vary': 'Accept,Authorization,Origin',
  'X-Powered-By': 'Community Solid Server',
  'Accept-Ranges': 'bytes'
});
const urn_solid_server_default_StaticAssetHandler = new (require('@solid/community-server').StaticAssetHandler)([
  df_1691_4,
  df_1691_6,
  df_1691_8,
  df_1691_10,
  df_1691_12,
  df_1691_14,
  df_1691_16,
  df_1691_18,
  df_1691_20,
  df_1691_22
], getVariableValue('urn:solid-server:default:variable:baseUrl'), {
  'expires': 86400
});
const urn_solid_server_default_MetadataWriter_StorageDescription = new (require('@solid/community-server').StorageDescriptionAdvertiser)(urn_solid_server_default_StorageLocationStrategy, '.well-known/solid');
const urn_solid_server_default_PreferenceParser = new (require('@solid/community-server').UnionPreferenceParser)([
  df_1825_0,
  df_1825_2
]);
const urn_solid_server_default_QuotaStrategy = new (require('@solid/community-server').PodQuotaStrategy)({
  'unit': 'bytes',
  'amount': 70000000
}, urn_solid_server_default_SizeReporter, urn_solid_server_default_IdentifierStrategy, urn_solid_server_default_AtomicFileDataAccessor);
const urn_solid_server_default_PatchHandler_ImmutableMetadata = new (require('@solid/community-server').ImmutableMetadataPatcher)(urn_solid_server_default_PatchHandler_RDF, urn_solid_server_default_MetadataStrategy, [
  df_1873_8,
  df_1873_10,
  df_1873_12,
  df_1873_14,
  df_1873_16,
  df_1873_18
]);
const urn_solid_server_default_Middleware_Cors = new (require('@solid/community-server').CorsHandler)({
  'methods': [
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'PATCH',
  'DELETE'
],
  'exposedHeaders': [
  'Accept-Patch',
  'Accept-Post',
  'Accept-Put',
  'Allow',
  'Content-Range',
  'ETag',
  'Last-Modified',
  'Link',
  'Location',
  'Updates-Via',
  'WAC-Allow',
  'Www-Authenticate'
],
  'credentials': true,
  'preflightContinue': false
});
const df_1709_0 = new (require('@solid/community-server').AllStaticReader)(true);
const df_1837_7 = new (require('@solid/community-server').LinkRelObject)('http://www.w3.org/ns/ldp#inbox', undefined, undefined);
const df_1837_10 = new (require('@solid/community-server').LinkRelObject)('urn:npm:solid:community-server:meta:preserve', true, undefined);
const df_1821_12 = new (require('@solid/community-server').MethodNotAllowedHttpError)(undefined, undefined, undefined);
const urn_solid_server_default_MainTemplateEngine = new (require('@solid/community-server').StaticTemplateEngine)(urn_solid_server_default_TemplateEngine, './templates/main.html.ejs');
const df_1889_0 = new (require('@solid/community-server').StaticTemplateEngine)(urn_solid_server_default_TemplateEngine, '@css:templates/container.md.hbs');
const urn_solid_server_default_ErrorToTemplateConverter = new (require('@solid/community-server').ErrorToTemplateConverter)(urn_solid_server_default_TemplateEngine, {});
const urn_solid_server_default_TargetExtractor = new (require('@solid/community-server').OriginalUrlExtractor)({
  'identifierStrategy': urn_solid_server_default_IdentifierStrategy,
  'includeQueryString': false
});
const urn_solid_server_default_IndexRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(df_1949_0, '.account/', undefined);
const urn_solid_server_default_MetadataWriter_LinkRel = new (require('@solid/community-server').LinkRelMetadataWriter)({
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': 'type',
  'http://www.w3.org/ns/ldp#inbox': 'http://www.w3.org/ns/ldp#inbox'
});
const urn_solid_server_default_MetadataWriter_Mapped = new (require('@solid/community-server').MappedMetadataWriter)({
  'urn:npm:solid:community-server:http:location': 'Location'
});
const df_1953_1 = new (require('@solid/community-server').CancelOidcHandler)();
const df_1827_10 = new (require('@solid/community-server').WaterfallHandler)([
  df_1827_6,
  df_1827_8
]);
const df_1731_14 = new (require('@solid/community-server').StaticThrowHandler)(df_1731_13);
const df_1731_6 = new (require('@solid/community-server').StaticThrowHandler)(df_1731_5);
const urn_solid_server_default_FileSystemResourceLocker = new (require('@solid/community-server').FileSystemResourceLocker)({
  'rootFilePath': getVariableValue('urn:solid-server:default:variable:rootFilePath'),
  'attemptSettings': {}
});
const urn_solid_server_default_WebhookRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_NotificationRoute, '/WebhookChannel2023/', undefined);
const urn_solid_server_default_StreamingHTTP2023Route = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_NotificationRoute, '/StreamingHTTPChannel2023/', undefined);
const urn_solid_server_default_WebSocket2023Route = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_NotificationRoute, '/WebSocketChannel2023/', undefined);
const urn_solid_server_default_QuotaValidator = new (require('@solid/community-server').QuotaValidator)(urn_solid_server_default_QuotaStrategy);
const df_1837_4 = new (require('@solid/community-server').LinkRelObject)('http://www.w3.org/1999/02/22-rdf-syntax-ns#type', undefined, [
  'http://www.w3.org/ns/ldp#BasicContainer',
  'http://www.w3.org/ns/ldp#Container',
  'http://www.w3.org/ns/ldp#Resource'
]);
const urn_solid_server_default_DefaultUiConverter = new (require('@solid/community-server').ConstantConverter)('./node_modules/mashlib/dist/databrowser.html', 'text/html', {
  'container': true,
  'document': true,
  'minQuality': 1,
  'disabledMediaRanges': [
  'image/*',
  'application/pdf'
]
});
const urn_solid_server_default_MetadataWriter_AllowAccept = new (require('@solid/community-server').AllowAcceptHeaderWriter)([
  'OPTIONS',
  'HEAD',
  'GET',
  'PATCH',
  'POST',
  'PUT',
  'DELETE'
], {
  'patch': [
  'text/n3',
  'application/sparql-update'
],
  'post': [
  '*/*'
],
  'put': [
  '*/*'
]
});
const df_1793_1 = new (require('@solid/community-server').WebhookWebId)(getVariableValue('urn:solid-server:default:variable:baseUrl'));
const df_1949_1 = new (require('@solid/community-server').StaticInteractionHandler)({});
const urn_solid_server_default_ParallelMiddleware = new (require('@solid/community-server').ParallelHandler)([
  urn_solid_server_default_Middleware_Header
]);
const df_1765_6 = new (require('@solid/community-server').StaticStorageDescriber)({
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': 'http://www.w3.org/ns/pim/space#Storage'
});
const urn_solid_server_default_AuthorizationParser = new (require('@solid/community-server').AuthorizationParser)({
  'CSS-Account-Token': 'urn:npm:solid:community-server:http:accountCookie'
});
const urn_solid_server_default_DPoPUrlExtractor = new (require('@solid/community-server').OriginalUrlExtractor)({
  'identifierStrategy': urn_solid_server_default_IdentifierStrategy
});
const df_1821_13 = new (require('@solid/community-server').StaticThrowHandler)(df_1821_12);
const urn_solid_server_default_MarkdownToHtmlConverter = new (require('@solid/community-server').MarkdownToHtmlConverter)(urn_solid_server_default_MainTemplateEngine);
const urn_solid_server_default_ContainerToTemplateConverter = new (require('@solid/community-server').ContainerToTemplateConverter)(df_1889_0, 'text/markdown', urn_solid_server_default_IdentifierStrategy);
const urn_solid_server_default_QuadToRdfConverter = new (require('@solid/community-server').QuadToRdfConverter)({
  'outputPreferences': {
  'text/turtle': '1',
  'application/n-triples': '9.5E-1',
  'application/trig': '9.5E-1',
  'application/n-quads': '9.5E-1',
  'text/n3': '9.5E-1',
  'application/ld+json': '8.0E-1'
}
});
const urn_solid_server_default_PatchHandler_RDFStore = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_PatchHandler_ImmutableMetadata,
  urn_solid_server_default_PatchHandler_RDF
]);
const urn_solid_server_default_LoginRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_IndexRoute, 'login/', undefined);
const urn_solid_server_default_AccountRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_IndexRoute, 'account/', undefined);
const urn_solid_server_default_IndexHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_IndexRoute, '@css:templates/identity/index.html.ejs');
const urn_solid_server_default_OidcRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_IndexRoute, 'oidc/', undefined);
const urn_solid_server_default_PatchBodyParser = new (require('@solid/community-server').MethodFilterHandler)([
  'PATCH'
], df_1827_10);
const df_1751_0 = new (require('@solid/community-server').PartialReadWriteLocker)(urn_solid_server_default_FileSystemResourceLocker);
const df_1751_1 = new (require('@solid/community-server').InitializableHandler)(urn_solid_server_default_FileSystemResourceLocker);
const df_1751_3 = new (require('@solid/community-server').FinalizableHandler)(urn_solid_server_default_FileSystemResourceLocker);
const urn_solid_server_default_WebhookWebIdRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_WebhookRoute, '/webId', false);
const urn_solid_server_default_StreamingHttpMetadataWriter = new (require('@solid/community-server').StreamingHttpMetadataWriter)(urn_solid_server_default_StreamingHTTP2023Route);
const urn_solid_server_default_WebSocketChannel2023Type = new (require('@solid/community-server').WebSocketChannel2023Type)(urn_solid_server_default_WebSocket2023Route, undefined);
const df_1953_2 = new (require('@solid/community-server').MethodFilterHandler)([
  'POST'
], df_1953_1);
const urn_solid_server_default_ValidatingFileDataAccessor = new (require('@solid/community-server').ValidatingDataAccessor)(urn_solid_server_default_AtomicFileDataAccessor, urn_solid_server_default_QuotaValidator);
const df_1965_0 = new (require('@solid/community-server').StaticTemplateEngine)(urn_solid_server_default_TemplateEngine, '@css:templates/identity/password/reset-email.html.ejs');
const urn_solid_server_default_CookieParser = new (require('@solid/community-server').CookieParser)({
  'css-account': 'urn:npm:solid:community-server:http:accountCookie'
});
const df_1885_2 = new (require('@solid/community-server').ChainedTemplateEngine)([
  urn_solid_server_default_TemplateEngine,
  urn_solid_server_default_MainTemplateEngine
], 'htmlBody');
const df_1937_2 = new (require('@solid/community-server').ChainedTemplateEngine)([
  urn_solid_server_default_TemplateEngine,
  urn_solid_server_default_MainTemplateEngine
], 'htmlBody');
const urn_solid_server_default_IndexRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_IndexRoute, df_1949_1);
const urn_solid_server_default_DPoPWebIdExtractor = new (require('@solid/community-server').DPoPWebIdExtractor)(urn_solid_server_default_DPoPUrlExtractor);
const urn_solid_server_default_RdfPatcher = new (require('@solid/community-server').RdfPatcher)(urn_solid_server_default_PatchHandler_RDFStore);
const urn_solid_server_default_LoginPasswordRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_LoginRoute, 'password/', undefined);
const urn_solid_server_default_LoginHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_LoginRoute, '@css:templates/identity/login.html.ejs');
const urn_solid_server_default_AccountIdRoute = new (require('@solid/community-server').BaseAccountIdRoute)(urn_solid_server_default_AccountRoute);
const urn_solid_server_default_AccountHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_AccountRoute, '@css:templates/identity/account/account.html.ejs');
const urn_solid_server_default_OidcConsentRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_OidcRoute, 'consent/', undefined);
const urn_solid_server_default_OidcCancelRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_OidcRoute, 'cancel/', undefined);
const urn_solid_server_default_OidcForgetWebIDRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_OidcRoute, 'forget-webid/', undefined);
const urn_solid_server_default_OidcPromptRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_OidcRoute, 'prompt/', undefined);
const urn_solid_server_default_OidcPickWebIdRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_OidcRoute, 'pick-webid/', undefined);
const urn_solid_server_default_ResourceLocker = new (require('@solid/community-server').WrappedExpiringReadWriteLocker)(df_1751_0, 6000);
const urn_solid_server_default_FileDataAccessor = new (require('@solid/community-server').FilterMetadataDataAccessor)(urn_solid_server_default_ValidatingFileDataAccessor, [
  df_1867_0
]);
const urn_solid_server_default_Middleware = new (require('@solid/community-server').SequenceHandler)([
  urn_solid_server_default_ParallelMiddleware,
  urn_solid_server_default_Middleware_Cors
]);
const urn_solid_server_default_MetadataWriter_Cookie = new (require('@solid/community-server').CookieMetadataWriter)({
  'urn:npm:solid:community-server:http:accountCookie': {
  'name': 'css-account',
  'expirationUri': 'urn:npm:solid:community-server:http:accountCookieExpiration'
}
});
const urn_solid_server_default_LinkRelParser = new (require('@solid/community-server').LinkRelParser)({
  'type': df_1837_4,
  'http://www.w3.org/ns/ldp#inbox': df_1837_7,
  'preserve': df_1837_10
});
const urn_solid_server_default_DynamicJsonToTemplateConverter = new (require('@solid/community-server').DynamicJsonToTemplateConverter)(df_1885_2);
const urn_solid_server_default_ChainedConverter = new (require('@solid/community-server').ChainedConverter)([
  urn_solid_server_default_ContentTypeReplacer,
  urn_solid_server_default_RdfToQuadConverter,
  urn_solid_server_default_QuadToRdfConverter,
  urn_solid_server_default_ContainerToTemplateConverter,
  urn_solid_server_default_ErrorToJsonConverter,
  urn_solid_server_default_ErrorToQuadConverter,
  urn_solid_server_default_ErrorToTemplateConverter,
  urn_solid_server_default_MarkdownToHtmlConverter,
  urn_solid_server_default_FormToJsonConverter
]);
const urn_solid_server_default_WebhookWebId = new (require('@solid/community-server').OperationRouterHandler)({
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': df_1793_1,
  'allowedPathNames': [
  '/WebhookChannel2023/webId$'
]
});
const df_1827_4 = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_PatchBodyParser,
  df_1827_2
]);
const urn_solid_server_default_CleanupInitializer = new (require('@solid/community-server').SequenceHandler)([
  df_1751_1
]);
const urn_solid_server_default_CleanupFinalizer = new (require('@solid/community-server').SequenceHandler)([
  df_1751_3
]);
const urn_solid_server_default_CancelOidcHandler = new (require('@solid/community-server').WaterfallHandler)([
  df_1953_2
]);
const urn_solid_server_default_RegisterPasswordRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_LoginPasswordRoute, 'register/', undefined);
const urn_solid_server_default_ForgotPasswordRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_LoginPasswordRoute, 'forgot/', undefined);
const urn_solid_server_default_PasswordLoginHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_LoginPasswordRoute, './templates/identity/password/login.html.ejs');
const urn_solid_server_default_ResetPasswordRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_LoginPasswordRoute, 'reset/', undefined);
const urn_solid_server_default_AccountClientCredentialsRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_AccountIdRoute, 'client-credentials/', undefined);
const urn_solid_server_default_AccountPodRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_AccountIdRoute, 'pod/', undefined);
const urn_solid_server_default_AccountWebIdRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_AccountIdRoute, 'webid/', undefined);
const urn_solid_server_default_AccountIdHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_AccountIdRoute, '@css:templates/identity/account/resource.html.ejs');
const urn_solid_server_default_AccountLoginRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_AccountIdRoute, 'login/', undefined);
const urn_solid_server_default_AccountLogoutRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_AccountIdRoute, 'logout/', undefined);
const urn_solid_server_default_OidcConsentHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_OidcConsentRoute, './templates/identity/oidc/consent.html.ejs');
const urn_solid_server_default_AccessTokenExtractor = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_DPoPWebIdExtractor,
  urn_solid_server_default_BearerWebIdExtractor
]);
const urn_solid_server_default_OidcCancelRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_OidcCancelRoute, urn_solid_server_default_CancelOidcHandler);
const urn_solid_server_default_RegisterPasswordAccountHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_RegisterPasswordRoute, '@css:templates/identity/password/register.html.ejs');
const urn_solid_server_default_ForgotPasswordHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_ForgotPasswordRoute, '@css:templates/identity/password/forgot.html.ejs');
const urn_solid_server_default_ResetPasswordHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_ResetPasswordRoute, '@css:templates/identity/password/reset.html.ejs');
const urn_solid_server_default_LoginHandler = new (require('@solid/community-server').ControlHandler)({
  'Email/password combination': urn_solid_server_default_LoginPasswordRoute
}, undefined);
const urn_solid_server_default_CreateClientCredentialsHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_AccountClientCredentialsRoute, '@css:templates/identity/account/create-client-credentials.html.ejs');
const urn_solid_server_default_AccountClientCredentialsIdRoute = new (require('@solid/community-server').BaseClientCredentialsIdRoute)(urn_solid_server_default_AccountClientCredentialsRoute);
const urn_solid_server_default_CreatePodHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_AccountPodRoute, '@css:templates/identity/account/create-pod.html.ejs');
const urn_solid_server_default_AccountPodIdRoute = new (require('@solid/community-server').BasePodIdRoute)(urn_solid_server_default_AccountPodRoute);
const urn_solid_server_default_LinkWebIdHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_AccountWebIdRoute, '@css:templates/identity/account/link-webid.html.ejs');
const urn_solid_server_default_AccountWebIdLinkRoute = new (require('@solid/community-server').BaseWebIdLinkRoute)(urn_solid_server_default_AccountWebIdRoute);
const urn_solid_server_default_AccountPasswordRoute = new (require('@solid/community-server').RelativePathInteractionRoute)(urn_solid_server_default_AccountLoginRoute, 'password/', undefined);
const urn_solid_server_default_PromptHandler = new (require('@solid/community-server').PromptHandler)({
  'account': urn_solid_server_default_LoginRoute,
  'login': urn_solid_server_default_OidcConsentRoute,
  'consent': urn_solid_server_default_OidcConsentRoute
});
const urn_solid_server_default_MainControlHandler = new (require('@solid/community-server').ControlHandler)({
  'index': urn_solid_server_default_IndexRoute,
  'logins': urn_solid_server_default_LoginRoute
}, undefined);
const urn_solid_server_default_OidcControlHandler = new (require('@solid/community-server').OidcControlHandler)({
  'cancel': urn_solid_server_default_OidcCancelRoute,
  'consent': urn_solid_server_default_OidcConsentRoute,
  'forgetWebId': urn_solid_server_default_OidcForgetWebIDRoute,
  'prompt': urn_solid_server_default_OidcPromptRoute,
  'webId': urn_solid_server_default_OidcPickWebIdRoute
}, undefined);
const urn_solid_server_default_MetadataParser = new (require('@solid/community-server').ParallelHandler)([
  urn_solid_server_default_AuthorizationParser,
  urn_solid_server_default_CookieParser,
  urn_solid_server_default_ContentTypeParser,
  urn_solid_server_default_LinkRelParser,
  urn_solid_server_default_PlainJsonLdFilter,
  urn_solid_server_default_SlugParser,
  urn_solid_server_default_ContentLengthParser
]);
const urn_solid_server_default_RepresentationConverter = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_DynamicJsonToTemplateConverter,
  urn_solid_server_default_ChainedConverter
]);
const urn_solid_server_default_MainHtmlControlHandler = new (require('@solid/community-server').ControlHandler)({
  'login': urn_solid_server_default_LoginRoute
}, undefined);
const urn_solid_server_default_UpdatePodHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_AccountPodIdRoute, '@css:templates/identity/account/pod-settings.html.ejs');
const urn_solid_server_default_AccountHtmlControlHandler = new (require('@solid/community-server').ControlHandler)({
  'createClientCredentials': urn_solid_server_default_AccountClientCredentialsRoute,
  'createPod': urn_solid_server_default_AccountPodRoute,
  'linkWebId': urn_solid_server_default_AccountWebIdRoute,
  'account': urn_solid_server_default_AccountIdRoute
}, undefined);
const urn_solid_server_default_CreatePasswordHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_AccountPasswordRoute, '@css:templates/identity/password/create.html.ejs');
const urn_solid_server_default_AccountPasswordIdRoute = new (require('@solid/community-server').BasePasswordIdRoute)(urn_solid_server_default_AccountPasswordRoute);
const urn_solid_server_default_AccountControlHandler = new (require('@solid/community-server').ControlHandler)({
  'create': urn_solid_server_default_AccountRoute,
  'clientCredentials': urn_solid_server_default_AccountClientCredentialsRoute,
  'pod': urn_solid_server_default_AccountPodRoute,
  'webId': urn_solid_server_default_AccountWebIdRoute,
  'logout': urn_solid_server_default_AccountLogoutRoute
}, undefined);
const urn_solid_server_default_OidcPromptRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_OidcPromptRoute, urn_solid_server_default_PromptHandler);
const urn_solid_server_default_UnionCredentialsExtractor = new (require('@solid/community-server').UnionCredentialsExtractor)([
  urn_solid_server_default_AccessTokenExtractor,
  urn_solid_server_default_PublicCredentialsExtractor
]);
const df_1877_0 = new (require('@solid/community-server').RdfValidator)(urn_solid_server_default_RepresentationConverter);
const df_1873_0 = new (require('@solid/community-server').ConvertingPatcher)(urn_solid_server_default_RdfPatcher, urn_solid_server_default_RepresentationConverter, 'internal/quads', 'text/turtle');
const urn_solid_server_default_BaseNotificationSerializer = new (require('@solid/community-server').ConvertingNotificationSerializer)(df_1775_9, urn_solid_server_default_RepresentationConverter);
const urn_solid_server_default_UiEnabledConverter = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_DefaultUiConverter,
  urn_solid_server_default_RepresentationConverter
]);
const df_1951_3 = new (require('@solid/community-server').ControlHandler)({
  'logins': urn_solid_server_default_LoginHandler
}, undefined);
const urn_solid_server_default_UpdatePasswordHtml = new (require('@solid/community-server').HtmlViewEntry)(urn_solid_server_default_AccountPasswordIdRoute, '@css:templates/identity/password/update.html.ejs');
const urn_solid_server_default_PasswordControlHandler = new (require('@solid/community-server').ControlHandler)({
  'create': urn_solid_server_default_AccountPasswordRoute,
  'forgot': urn_solid_server_default_ForgotPasswordRoute,
  'login': urn_solid_server_default_LoginPasswordRoute,
  'reset': urn_solid_server_default_ResetPasswordRoute
}, undefined);
const urn_solid_server_default_PasswordHtmlControlHandler = new (require('@solid/community-server').ControlHandler)({
  'register': urn_solid_server_default_RegisterPasswordRoute,
  'create': urn_solid_server_default_AccountPasswordRoute,
  'forgot': urn_solid_server_default_ForgotPasswordRoute,
  'login': urn_solid_server_default_LoginPasswordRoute
}, undefined);
const urn_solid_server_default_RequestParser = new (require('@solid/community-server').BasicRequestParser)({
  'targetExtractor': urn_solid_server_default_TargetExtractor,
  'preferenceParser': urn_solid_server_default_PreferenceParser,
  'metadataParser': urn_solid_server_default_MetadataParser,
  'conditionsParser': df_1827_0,
  'bodyParser': df_1827_4
});
const urn_solid_server_default_CredentialsExtractor = new (require('@solid/community-server').CachedHandler)(urn_solid_server_default_UnionCredentialsExtractor, undefined);
const urn_solid_server_default_AclStrategy = new (require('@solid/community-server').ComposedAuxiliaryStrategy)(urn_solid_server_default_AclIdentifierStrategy, undefined, df_1877_0, true, true);
const df_1873_5 = new (require('@solid/community-server').WaterfallHandler)([
  df_1873_0,
  df_1873_3
]);
const urn_solid_server_default_ConvertingErrorHandler = new (require('@solid/community-server').ConvertingErrorHandler)(urn_solid_server_default_UiEnabledConverter, urn_solid_server_default_PreferenceParser, getVariableValue('urn:solid-server:default:variable:showStackTrace'));
const urn_solid_server_default_EmailSender = new (require('@solid/community-server').BaseEmailSender)({
  'emailConfig': {
  'host': 'smtp.sendgrid.net',
  'port': 465,
  'auth': {
  'user': 'apikey',
  'pass': '<fill me in>'
}
},
  'senderName': 'no-reply@solidcommunity.net'
});
const df_1951_4 = new (require('@solid/community-server').MethodFilterHandler)([
  'GET'
], df_1951_3);
const urn_solid_server_default_HtmlViewHandler = new (require('@solid/community-server').HtmlViewHandler)(urn_solid_server_default_IndexRoute, df_1937_2, [
  urn_solid_server_default_RegisterPasswordAccountHtml,
  urn_solid_server_default_CreateClientCredentialsHtml,
  urn_solid_server_default_CreatePodHtml,
  urn_solid_server_default_LinkWebIdHtml,
  urn_solid_server_default_UpdatePodHtml,
  urn_solid_server_default_AccountHtml,
  urn_solid_server_default_AccountIdHtml,
  urn_solid_server_default_IndexHtml,
  urn_solid_server_default_LoginHtml,
  urn_solid_server_default_OidcConsentHtml,
  urn_solid_server_default_CreatePasswordHtml,
  urn_solid_server_default_ForgotPasswordHtml,
  urn_solid_server_default_PasswordLoginHtml,
  urn_solid_server_default_ResetPasswordHtml,
  urn_solid_server_default_UpdatePasswordHtml
]);
const urn_solid_server_default_AuxiliaryStrategy = new (require('@solid/community-server').RoutingAuxiliaryStrategy)([
  df_1735_6,
  urn_solid_server_default_AclStrategy,
  urn_solid_server_default_MetadataStrategy
]);
const urn_solid_server_default_PatchHandler = new (require('@solid/community-server').RepresentationPatchHandler)(df_1873_5);
const urn_solid_server_default_LoginRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_LoginRoute, df_1951_4);
const urn_solid_server_default_HtmlControlHandler = new (require('@solid/community-server').ControlHandler)({
  'password': urn_solid_server_default_PasswordHtmlControlHandler,
  'account': urn_solid_server_default_AccountHtmlControlHandler,
  'main': urn_solid_server_default_MainHtmlControlHandler
}, undefined);
const urn_solid_server_default_WaterfallErrorHandler = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_RedirectingErrorHandler,
  urn_solid_server_default_EmptyErrorHandler,
  urn_solid_server_default_ConvertingErrorHandler
]);
const urn_solid_server_default_ResourceStore_Backend = new (require('@solid/community-server').DataAccessorBasedStore)(urn_solid_server_default_FileDataAccessor, urn_solid_server_default_IdentifierStrategy, urn_solid_server_default_AuxiliaryStrategy, urn_solid_server_default_MetadataStrategy);
const urn_solid_server_default_MetadataWriter_LinkRelMetadata = new (require('@solid/community-server').AuxiliaryLinkMetadataWriter)(urn_solid_server_default_AuxiliaryStrategy, urn_solid_server_default_MetadataStrategy, 'describedby');
const urn_solid_server_default_MetadataWriter_LinkRelAcl = new (require('@solid/community-server').AuxiliaryLinkMetadataWriter)(urn_solid_server_default_AuxiliaryStrategy, urn_solid_server_default_AclStrategy, 'acl');
const urn_solid_server_default_TargetExtractorErrorHandler = new (require('@solid/community-server').TargetExtractorErrorHandler)(urn_solid_server_default_WaterfallErrorHandler, urn_solid_server_default_TargetExtractor);
const urn_solid_server_default_ResourceStore_Converting = new (require('@solid/community-server').RepresentationConvertingStore)(urn_solid_server_default_ResourceStore_Backend, urn_solid_server_default_MetadataStrategy, {
  'outConverter': urn_solid_server_default_UiEnabledConverter,
  'inConverter': urn_solid_server_default_RepresentationConverter,
  'inPreferences': {
  'type': {},
  'charset': {},
  'datetime': {},
  'encoding': {},
  'language': {},
  'range': {}
}
});
const df_1939_7 = new (require('@solid/community-server').SingleContainerJsonStorage)(urn_solid_server_default_ResourceStore_Backend, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/setup/');
const df_1939_8 = new (require('@solid/community-server').SingleContainerJsonStorage)(urn_solid_server_default_ResourceStore_Backend, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/accounts/');
const df_1939_9 = new (require('@solid/community-server').SingleContainerJsonStorage)(urn_solid_server_default_ResourceStore_Backend, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/accounts/credentials/');
const urn_solid_server_default_V6MigrationForgotPasswordStorage = new (require('@solid/community-server').SingleContainerJsonStorage)(urn_solid_server_default_ResourceStore_Backend, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/forgot-password/');
const urn_solid_server_default_V6MigrationKeyStorage = new (require('@solid/community-server').SingleContainerJsonStorage)(urn_solid_server_default_ResourceStore_Backend, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/idp/keys/');
const urn_solid_server_default_V6MigrationAdapterStorage = new (require('@solid/community-server').SingleContainerJsonStorage)(urn_solid_server_default_ResourceStore_Backend, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/idp/adapter/');
const urn_solid_server_default_V6MigrationTokenStorage = new (require('@solid/community-server').SingleContainerJsonStorage)(urn_solid_server_default_ResourceStore_Backend, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/idp/tokens/');
const urn_solid_server_default_V6MigrationNotificationStorage = new (require('@solid/community-server').SingleContainerJsonStorage)(urn_solid_server_default_ResourceStore_Backend, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/notifications/');
const urn_solid_server_default_ControlHandler = new (require('@solid/community-server').ControlHandler)({
  'password': urn_solid_server_default_PasswordControlHandler,
  'account': urn_solid_server_default_AccountControlHandler,
  'main': urn_solid_server_default_MainControlHandler,
  'oidc': urn_solid_server_default_OidcControlHandler,
  'html': urn_solid_server_default_HtmlControlHandler
}, undefined);
const urn_solid_server_default_ErrorHandler = new (require('@solid/community-server').SafeErrorHandler)(urn_solid_server_default_TargetExtractorErrorHandler, getVariableValue('urn:solid-server:default:variable:showStackTrace'));
const urn_solid_server_default_ResourceStore_RdfPatching = new (require('@solid/pivot').RdfPatchingStore)(urn_solid_server_default_ResourceStore_Converting, urn_solid_server_default_PatchHandler);
const urn_solid_server_default_V6MigrationSetupStorage = new (require('@solid/community-server').Base64EncodingStorage)(df_1939_7);
const urn_solid_server_default_V6MigrationAccountStorage = new (require('@solid/community-server').Base64EncodingStorage)(df_1939_8);
const urn_solid_server_default_V6MigrationClientCredentialsStorage = new (require('@solid/community-server').Base64EncodingStorage)(df_1939_9);
const urn_solid_server_default_ResourceStore_Locking = new (require('@solid/community-server').LockingResourceStore)(urn_solid_server_default_ResourceStore_RdfPatching, urn_solid_server_default_ResourceLocker, urn_solid_server_default_AuxiliaryStrategy);
const urn_solid_server_default_ResourceStore_Index = new (require('@solid/community-server').IndexRepresentationStore)(urn_solid_server_default_ResourceStore_Locking, undefined, undefined);
const urn_solid_server_default_ResourceStore_BinarySlice = new (require('@solid/community-server').BinarySliceResourceStore)(urn_solid_server_default_ResourceStore_Index, 10000000);
const urn_solid_server_default_ResourceStore = new (require('@solid/community-server').MonitoringStore)(urn_solid_server_default_ResourceStore_BinarySlice);
const urn_solid_server_default_JsonResourceStorage = new (require('@solid/community-server').JsonResourceStorage)(urn_solid_server_default_ResourceStore, getVariableValue('urn:solid-server:default:variable:baseUrl'), '/.internal/');
const df_1775_3 = new (require('@solid/community-server').AddRemoveNotificationGenerator)(urn_solid_server_default_ResourceStore, urn_solid_server_default_ETagHandler);
const df_1775_5 = new (require('@solid/community-server').ActivityNotificationGenerator)(urn_solid_server_default_ResourceStore, urn_solid_server_default_ETagHandler);
const urn_solid_server_default_CachedResourceSet = new (require('@solid/community-server').CachedResourceSet)(urn_solid_server_default_ResourceStore);
const df_1821_0 = new (require('@solid/community-server').GetOperationHandler)(urn_solid_server_default_ResourceStore, urn_solid_server_default_ETagHandler);
const df_1821_2 = new (require('@solid/community-server').PostOperationHandler)(urn_solid_server_default_ResourceStore);
const df_1821_4 = new (require('@solid/community-server').PutOperationHandler)(urn_solid_server_default_ResourceStore, urn_solid_server_default_MetadataStrategy);
const df_1821_6 = new (require('@solid/community-server').DeleteOperationHandler)(urn_solid_server_default_ResourceStore);
const df_1821_8 = new (require('@solid/community-server').HeadOperationHandler)(urn_solid_server_default_ResourceStore, urn_solid_server_default_ETagHandler);
const df_1821_10 = new (require('@solid/community-server').PatchOperationHandler)(urn_solid_server_default_ResourceStore);
const urn_solid_server_default_KeyValueStorage = new (require('@solid/community-server').MaxKeyLengthStorage)(urn_solid_server_default_JsonResourceStorage, undefined, undefined);
const df_1815_3 = new (require('@solid/community-server').BaseResourcesGenerator)({
  'factory': df_1815_2,
  'templateEngine': urn_solid_server_default_TemplateEngine,
  'metadataStrategy': urn_solid_server_default_MetadataStrategy,
  'store': urn_solid_server_default_ResourceStore
});
const df_1731_9 = new (require('@solid/community-server').N3PatchModesExtractor)(urn_solid_server_default_CachedResourceSet);
const df_1731_11 = new (require('@solid/community-server').SparqlUpdateModesExtractor)(urn_solid_server_default_CachedResourceSet);
const df_1731_2 = new (require('@solid/community-server').MethodModesExtractor)(urn_solid_server_default_CachedResourceSet);
const urn_solid_server_default_Authorizer = new (require('@solid/community-server').PermissionBasedAuthorizer)(urn_solid_server_default_CachedResourceSet);
const df_1775_7 = new (require('@solid/community-server').WaterfallHandler)([
  df_1775_1,
  df_1775_3,
  df_1775_5
]);
const urn_solid_server_default_OperationHandler = new (require('@solid/community-server').WaterfallHandler)([
  df_1821_0,
  df_1821_2,
  df_1821_4,
  df_1821_6,
  df_1821_8,
  df_1821_10,
  df_1821_13
]);
const df_1915_0 = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/accounts/data/');
const df_1915_1 = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/accounts/index/');
const urn_solid_server_default_SetupStorage = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/setup/');
const df_1781_0 = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/notifications/');
const urn_solid_server_default_KeyStorage = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/idp/keys/');
const df_1915_2 = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/accounts/cookies/');
const df_1909_0 = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/idp/adapter/');
const df_1803_2 = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/accounts/forgot-password/');
const df_1715_0 = new (require('@solid/community-server').ContainerPathStorage)(urn_solid_server_default_KeyValueStorage, '/idp/tokens/');
const urn_solid_server_default_TemplatedResourcesGenerator = new (require('@solid/community-server').SubfolderResourcesGenerator)(df_1815_3, [
  'base'
]);
const df_1731_3 = new (require('@solid/community-server').DeleteParentExtractor)(df_1731_2, urn_solid_server_default_CachedResourceSet, urn_solid_server_default_IdentifierStrategy);
const df_1775_8 = new (require('@solid/community-server').StateNotificationGenerator)(df_1775_7, urn_solid_server_default_CachedResourceSet);
const df_1731_16 = new (require('@solid/community-server').WaterfallHandler)([
  df_1731_9,
  df_1731_11,
  df_1731_14
]);
const urn_solid_server_default_IndexedStorage = new (require('@solid/community-server').WrappedIndexedStorage)(df_1915_0, df_1915_1);
const urn_solid_server_default_BaseUrlVerifier = new (require('@solid/community-server').BaseUrlVerifier)(getVariableValue('urn:solid-server:default:variable:baseUrl'), 'current-base-url', urn_solid_server_default_SetupStorage);
const urn_solid_server_default_ModuleVersionVerifier = new (require('@solid/community-server').ModuleVersionVerifier)('current-server-version', urn_solid_server_default_SetupStorage);
const urn_solid_server_default_SubscriptionStorage = new (require('@solid/community-server').KeyValueChannelStorage)(df_1781_0, urn_solid_server_default_ResourceLocker);
const urn_solid_server_default_JwkGenerator = new (require('@solid/community-server').CachedJwkGenerator)('ES256', 'jwks', urn_solid_server_default_KeyStorage);
const urn_solid_server_default_CookieStorage = new (require('@solid/community-server').WrappedExpiringStorage)(df_1915_2, undefined);
const df_1909_1 = new (require('@solid/community-server').WrappedExpiringStorage)(df_1909_0, undefined);
const urn_solid_server_default_ForgotPasswordStorage = new (require('@solid/community-server').WrappedExpiringStorage)(df_1803_2, undefined);
const urn_solid_server_default_ExpiringTokenStorage = new (require('@solid/community-server').WrappedExpiringStorage)(df_1715_0, undefined);
const urn_solid_server_default_PodResourcesGenerator = new (require('@solid/community-server').StaticFolderGenerator)(urn_solid_server_default_TemplatedResourcesGenerator, 'templates/pod');
const urn_solid_server_default_BaseNotificationGenerator = new (require('@solid/community-server').CachedHandler)(df_1775_8, [
  'topic'
]);
const df_1731_17 = new (require('@solid/community-server').MethodFilterHandler)([
  'PATCH'
], df_1731_16);
const urn_solid_server_default_AccountStorage = new (require('@solid/community-server').BaseLoginAccountStorage)(urn_solid_server_default_IndexedStorage, undefined);
const urn_solid_server_default_WebSocket2023Storer = new (require('@solid/community-server').WebSocket2023Storer)(urn_solid_server_default_SubscriptionStorage, urn_solid_server_default_WebSocketMap, undefined);
const df_1777_9 = new (require('@solid/community-server').NotificationUnsubscriber)(urn_solid_server_default_SubscriptionStorage);
const urn_solid_server_default_WebhookEmitter = new (require('@solid/community-server').WebhookEmitter)(getVariableValue('urn:solid-server:default:variable:baseUrl'), urn_solid_server_default_WebhookWebIdRoute, urn_solid_server_default_JwkGenerator, undefined);
const urn_solid_server_default_CookieStore = new (require('@solid/community-server').BaseCookieStore)(urn_solid_server_default_CookieStorage, undefined);
const df_1909_2 = new (require('@solid/community-server').ExpiringAdapterFactory)(df_1909_1);
const urn_solid_server_default_ForgotPasswordStore = new (require('@solid/community-server').BaseForgotPasswordStore)(urn_solid_server_default_ForgotPasswordStorage, undefined);
const urn_solid_server_default_OwnershipValidator = new (require('@solid/community-server').TokenOwnershipValidator)(urn_solid_server_default_ExpiringTokenStorage, undefined);
const urn_solid_server_default_PodManager = new (require('@solid/community-server').GeneratedPodManager)(urn_solid_server_default_ResourceStore, urn_solid_server_default_PodResourcesGenerator);
const urn_solid_server_default_StreamingHttp2023RequestHandler = new (require('@solid/community-server').StreamingHttpRequestHandler)(urn_solid_server_default_StreamingHttpMap, urn_solid_server_default_StreamingHTTP2023Route, urn_solid_server_default_BaseNotificationGenerator, urn_solid_server_default_BaseNotificationSerializer, urn_solid_server_default_CredentialsExtractor, urn_solid_server_default_PermissionReader, urn_solid_server_default_Authorizer);
const urn_solid_server_default_PatchModesExtractor = new (require('@solid/community-server').CreateModesExtractor)(df_1731_17, urn_solid_server_default_CachedResourceSet);
const urn_solid_server_default_PasswordStore = new (require('@solid/community-server').BasePasswordStore)(urn_solid_server_default_AccountStorage, undefined);
const urn_solid_server_default_AccountStore = new (require('@solid/community-server').BaseAccountStore)(urn_solid_server_default_AccountStorage);
const urn_solid_server_default_ClientCredentialsStore = new (require('@solid/community-server').BaseClientCredentialsStore)(urn_solid_server_default_AccountStorage);
const urn_solid_server_default_WebIdStore = new (require('@solid/community-server').BaseWebIdStore)(urn_solid_server_default_AccountStorage);
const urn_solid_server_default_WebSocket2023Subscriber = new (require('@solid/community-server').NotificationSubscriber)({
  'channelType': urn_solid_server_default_WebSocketChannel2023Type,
  'converter': urn_solid_server_default_RepresentationConverter,
  'credentialsExtractor': urn_solid_server_default_CredentialsExtractor,
  'permissionReader': urn_solid_server_default_PermissionReader,
  'authorizer': urn_solid_server_default_Authorizer,
  'storage': urn_solid_server_default_SubscriptionStorage
});
const urn_solid_server_default_LogoutHandler = new (require('@solid/community-server').LogoutHandler)(urn_solid_server_default_CookieStore);
const df_1909_3 = new (require('@solid/community-server').ClientIdAdapterFactory)(df_1909_2, urn_solid_server_default_RepresentationConverter);
const urn_solid_server_default_PodStore = new (require('@solid/community-server').BasePodStore)(urn_solid_server_default_AccountStorage, urn_solid_server_default_PodManager, undefined);
const df_1785_0 = new (require('@solid/community-server').ComposedNotificationHandler)({
  'generator': urn_solid_server_default_BaseNotificationGenerator,
  'serializer': urn_solid_server_default_BaseNotificationSerializer,
  'emitter': urn_solid_server_default_WebSocket2023Emitter,
  'eTagHandler': urn_solid_server_default_ETagHandler
});
const urn_solid_server_default_StreamingHttpNotificationHandler = new (require('@solid/community-server').ComposedNotificationHandler)({
  'generator': urn_solid_server_default_BaseNotificationGenerator,
  'serializer': urn_solid_server_default_BaseNotificationSerializer,
  'emitter': urn_solid_server_default_StreamingHttp2023Emitter,
  'eTagHandler': urn_solid_server_default_ETagHandler
});
const urn_solid_server_default_CreatePasswordHandler = new (require('@solid/community-server').CreatePasswordHandler)(urn_solid_server_default_PasswordStore, urn_solid_server_default_AccountPasswordIdRoute);
const urn_solid_server_default_ResetPasswordHandler = new (require('@solid/community-server').ResetPasswordHandler)(urn_solid_server_default_PasswordStore, urn_solid_server_default_ForgotPasswordStore);
const df_1971_0 = new (require('@solid/community-server').UpdatePasswordHandler)(urn_solid_server_default_PasswordStore, urn_solid_server_default_AccountPasswordIdRoute);
const df_1971_4 = new (require('@solid/community-server').DeletePasswordHandler)(urn_solid_server_default_PasswordStore, urn_solid_server_default_AccountPasswordIdRoute);
const urn_solid_server_default_CreateAccountHandler = new (require('@solid/community-server').CreateAccountHandler)(urn_solid_server_default_AccountStore, urn_solid_server_default_CookieStore);
const df_1921_1 = new (require('@solid/community-server').ClientCredentialsDetailsHandler)(urn_solid_server_default_ClientCredentialsStore, urn_solid_server_default_AccountClientCredentialsIdRoute);
const df_1921_5 = new (require('@solid/community-server').DeleteClientCredentialsHandler)(urn_solid_server_default_ClientCredentialsStore, urn_solid_server_default_AccountClientCredentialsIdRoute);
const df_1767_5 = new (require('@solid/pivot').FedcmHttpHandler)(getVariableValue('urn:solid-server:default:variable:baseUrl'), urn_solid_server_default_CookieStore, urn_solid_server_default_WebIdStore);
const df_1913_0 = new (require('@solid/community-server').AccountPromptFactory)(urn_solid_server_default_WebIdStore, urn_solid_server_default_CookieStore, 'css-account');
const urn_solid_server_default_CreateClientCredentialsHandler = new (require('@solid/community-server').CreateClientCredentialsHandler)(urn_solid_server_default_WebIdStore, urn_solid_server_default_ClientCredentialsStore, urn_solid_server_default_AccountClientCredentialsIdRoute);
const df_1935_1 = new (require('@solid/community-server').UnlinkWebIdHandler)(urn_solid_server_default_WebIdStore, urn_solid_server_default_AccountWebIdLinkRoute);
const urn_solid_server_default_V6MigrationInitializer = new (require('@solid/community-server').V6MigrationInitializer)({
  'setupStorage': urn_solid_server_default_V6MigrationSetupStorage,
  'versionKey': 'current-server-version',
  'accountStorage': urn_solid_server_default_V6MigrationAccountStorage,
  'clientCredentialsStorage': urn_solid_server_default_V6MigrationClientCredentialsStorage,
  'cleanupStorages': [
  urn_solid_server_default_V6MigrationAccountStorage,
  urn_solid_server_default_V6MigrationClientCredentialsStorage,
  urn_solid_server_default_V6MigrationForgotPasswordStorage,
  urn_solid_server_default_V6MigrationKeyStorage,
  urn_solid_server_default_V6MigrationAdapterStorage,
  urn_solid_server_default_V6MigrationTokenStorage,
  urn_solid_server_default_V6MigrationNotificationStorage
],
  'newAccountStorage': urn_solid_server_default_AccountStorage,
  'newSetupStorage': urn_solid_server_default_SetupStorage,
  'skipConfirmation': getVariableValue('urn:solid-server:default:variable:confirmMigration')
});
const urn_solid_server_default_NotificationDeleteHandler = new (require('@solid/community-server').OperationRouterHandler)({
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': df_1777_9,
  'allowedMethods': [
  'DELETE'
]
});
const df_1791_0 = new (require('@solid/community-server').ComposedNotificationHandler)({
  'generator': urn_solid_server_default_BaseNotificationGenerator,
  'serializer': urn_solid_server_default_BaseNotificationSerializer,
  'emitter': urn_solid_server_default_WebhookEmitter,
  'eTagHandler': urn_solid_server_default_ETagHandler
});
const df_1945_1 = new (require('@solid/community-server').MethodFilterHandler)([
  'POST'
], urn_solid_server_default_LogoutHandler);
const urn_solid_server_default_IdpAdapterFactory = new (require('@solid/community-server').ClientCredentialsAdapterFactory)(df_1909_3, urn_solid_server_default_WebIdStore, urn_solid_server_default_ClientCredentialsStore);
const urn_solid_server_default_MetadataWriter_Owner = new (require('@solid/community-server').OwnerMetadataWriter)(urn_solid_server_default_PodStore, urn_solid_server_default_StorageLocationStrategy);
const urn_solid_server_default_PodResourceHandler = new (require('@solid/community-server').UpdateOwnerHandler)(urn_solid_server_default_PodStore, urn_solid_server_default_AccountPodIdRoute);
const urn_solid_server_default_HttpModesExtractor = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_PatchModesExtractor,
  df_1731_3,
  df_1731_6
]);
const urn_solid_server_default_EarlyProcessParallelInitializer = new (require('@solid/community-server').ParallelHandler)([
  urn_solid_server_default_PasswordStore,
  urn_solid_server_default_AccountStore,
  urn_solid_server_default_ClientCredentialsStore,
  urn_solid_server_default_PodStore,
  urn_solid_server_default_WebIdStore
]);
const urn_solid_server_default_WebSocket2023NotificationHandler = new (require('@solid/community-server').TypedNotificationHandler)('http://www.w3.org/ns/solid/notifications#WebSocketChannel2023', df_1785_0);
const urn_solid_server_default_StreamingHttpListeningActivityHandler = new (require('@solid/community-server').StreamingHttpListeningActivityHandler)(urn_solid_server_default_ResourceStore, urn_solid_server_default_StreamingHttpMap, urn_solid_server_default_StreamingHttpNotificationHandler);
const urn_solid_server_default_StreamingHttp2023Router = new (require('@solid/community-server').OperationRouterHandler)({
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': urn_solid_server_default_StreamingHttp2023RequestHandler,
  'allowedMethods': [
  'GET'
],
  'allowedPathNames': [
  '/StreamingHTTPChannel2023/'
]
});
const df_1963_0 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_CreatePasswordHandler);
const df_1969_0 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_ResetPasswordHandler);
const df_1971_1 = new (require('@solid/community-server').ViewInteractionHandler)(df_1971_0);
const df_1971_5 = new (require('@solid/community-server').MethodFilterHandler)([
  'DELETE'
], df_1971_4);
const urn_solid_server_default_ForgotPasswordHandler = new (require('@solid/community-server').ForgotPasswordHandler)({
  'passwordStore': urn_solid_server_default_PasswordStore,
  'forgotPasswordStore': urn_solid_server_default_ForgotPasswordStore,
  'templateEngine': df_1965_0,
  'emailSender': urn_solid_server_default_EmailSender,
  'resetRoute': urn_solid_server_default_ResetPasswordRoute
});
const df_1941_0 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_CreateAccountHandler);
const urn_solid_server_default_PasswordLoginHandler = new (require('@solid/pivot').MigratedPasswordLoginHandler)({
  'accountStore': urn_solid_server_default_AccountStore,
  'passwordStore': urn_solid_server_default_PasswordStore,
  'cookieStore': urn_solid_server_default_CookieStore
});
const df_1921_2 = new (require('@solid/community-server').MethodFilterHandler)([
  'GET'
], df_1921_1);
const df_1921_6 = new (require('@solid/community-server').MethodFilterHandler)([
  'DELETE'
], df_1921_5);
const df_1919_0 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_CreateClientCredentialsHandler);
const urn_solid_server_default_WebIdLinkHandler = new (require('@solid/community-server').MethodFilterHandler)([
  'DELETE'
], df_1935_1);
const urn_solid_server_default_V6MigrationHandler = new (require('@solid/community-server').ConditionalHandler)(urn_solid_server_default_V6MigrationInitializer, urn_solid_server_default_SetupStorage, 'v6-migration', true, true);
const urn_solid_server_default_WebSocket2023Router = new (require('@solid/community-server').OperationRouterHandler)({
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': urn_solid_server_default_WebSocket2023Subscriber,
  'allowedMethods': [
  'HEAD',
  'GET',
  'POST'
],
  'allowedPathNames': [
  '/WebSocketChannel2023/$'
]
});
const urn_solid_server_default_WebhookNotificationHandler = new (require('@solid/community-server').TypedNotificationHandler)('http://www.w3.org/ns/solid/notifications#WebhookChannel2023', df_1791_0);
const urn_solid_server_default_AccountLogoutRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountLogoutRoute, df_1945_1);
const urn_solid_server_default_PodCreator = new (require('@solid/community-server').BasePodCreator)({
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'identifierGenerator': urn_solid_server_default_IdentifierGenerator,
  'relativeWebIdPath': '/profile/card#me',
  'webIdStore': urn_solid_server_default_WebIdStore,
  'podStore': urn_solid_server_default_PodStore
});
const df_1931_0 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_PodResourceHandler);
const urn_solid_server_default_LinkWebIdHandler = new (require('@solid/community-server').LinkWebIdHandler)({
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'ownershipValidator': urn_solid_server_default_OwnershipValidator,
  'podStore': urn_solid_server_default_PodStore,
  'webIdStore': urn_solid_server_default_WebIdStore,
  'webIdRoute': urn_solid_server_default_AccountWebIdLinkRoute,
  'storageStrategy': urn_solid_server_default_StorageLocationStrategy
});
const df_1731_0 = new (require('@solid/community-server').IntermediateCreateExtractor)(urn_solid_server_default_CachedResourceSet, urn_solid_server_default_IdentifierStrategy, urn_solid_server_default_HttpModesExtractor);
const urn_solid_server_default_PromptFactory = new (require('@solid/community-server').SequenceHandler)([
  df_1913_0
]);
const urn_solid_server_default_MetadataWriter = new (require('@solid/community-server').ParallelHandler)([
  urn_solid_server_default_MetadataWriter_AllowAccept,
  urn_solid_server_default_MetadataWriter_ContentType,
  urn_solid_server_default_MetadataWriter_LinkRel,
  urn_solid_server_default_MetadataWriter_LinkRelMetadata,
  urn_solid_server_default_MetadataWriter_Cookie,
  urn_solid_server_default_MetadataWriter_Mapped,
  urn_solid_server_default_MetadataWriter_Modified,
  urn_solid_server_default_MetadataWriter_Range,
  urn_solid_server_default_MetadataWriter_StorageDescription,
  urn_solid_server_default_MetadataWriter_WwwAuth,
  urn_solid_server_default_StreamingHttpMetadataWriter,
  urn_solid_server_default_MetadataWriter_LinkRelAcl,
  urn_solid_server_default_MetadataWriter_Owner
]);
const urn_solid_server_default_WebSocket2023StateHandler = new (require('@solid/community-server').BaseStateHandler)(urn_solid_server_default_WebSocket2023NotificationHandler, urn_solid_server_default_SubscriptionStorage);
const urn_solid_server_default_AccountPasswordRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountPasswordRoute, df_1963_0);
const urn_solid_server_default_ResetPasswordRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_ResetPasswordRoute, df_1969_0);
const df_1965_1 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_ForgotPasswordHandler);
const urn_solid_server_default_AccountRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_AccountRoute, df_1941_0);
const df_1967_0 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_PasswordLoginHandler);
const urn_pivot_default_FedcmHandler = new (require('@solid/community-server').RouterHandler)({
  'targetExtractor': urn_solid_server_default_TargetExtractor,
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': df_1767_5,
  'allowedPathNames': [
  '/\.well-known/web-identity',
  '/\.well-known/fedcm/fedcm.json',
  '/\.well-known/fedcm/token',
  '/\.well-known/fedcm/accounts_endpoint',
  '/\.well-known/fedcm/client_metadata_endpoint'
]
});
const urn_solid_server_default_AccountClientCredentialsRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountClientCredentialsRoute, df_1919_0);
const urn_solid_server_default_AccountWebIdLinkRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountWebIdLinkRoute, urn_solid_server_default_WebIdLinkHandler);
const df_1795_4 = new (require('@solid/community-server').BaseStateHandler)(urn_solid_server_default_WebhookNotificationHandler, urn_solid_server_default_SubscriptionStorage);
const urn_solid_server_default_CreatePodHandler = new (require('@solid/community-server').CreatePodHandler)(urn_solid_server_default_PodStore, urn_solid_server_default_PodCreator, urn_solid_server_default_AccountWebIdLinkRoute, urn_solid_server_default_AccountPodIdRoute, false);
const urn_solid_server_default_AccountPodIdRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountPodIdRoute, df_1931_0);
const urn_solid_server_default_WebIdHandler = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_LinkWebIdHandler);
const urn_solid_server_default_ModesExtractor = new (require('@solid/community-server').CachedHandler)(df_1731_0, undefined);
const urn_solid_server_default_PasswordResourceHandler = new (require('@solid/community-server').WaterfallHandler)([
  df_1971_1,
  df_1971_5
]);
const urn_solid_server_default_ClientCredentialsResourceHandler = new (require('@solid/community-server').WaterfallHandler)([
  df_1921_2,
  df_1921_6
]);
const urn_solid_server_default_MigrationInitializer = new (require('@solid/community-server').SequenceHandler)([
  urn_solid_server_default_V6MigrationHandler
]);
const urn_solid_server_default_NotificationHandler = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_WebSocket2023NotificationHandler,
  urn_solid_server_default_WebhookNotificationHandler
]);
const urn_solid_server_default_ResponseWriter = new (require('@solid/pivot').PivotResponseWriter)(urn_solid_server_default_MetadataWriter, urn_solid_server_default_ResourceStore, urn_solid_server_default_TargetExtractor);
const urn_solid_server_default_ForgotPasswordRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_ForgotPasswordRoute, df_1965_1);
const urn_solid_server_default_LoginPasswordRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_LoginPasswordRoute, df_1967_0);
const urn_solid_server_default_WebhookChannel2023Type = new (require('@solid/community-server').WebhookChannel2023Type)(urn_solid_server_default_WebhookRoute, urn_solid_server_default_WebhookWebIdRoute, df_1795_4, undefined);
const urn_solid_server_default_SeededAccountInitializer = new (require('@solid/community-server').SeededAccountInitializer)({
  'accountStore': urn_solid_server_default_AccountStore,
  'passwordStore': urn_solid_server_default_PasswordStore,
  'podCreator': urn_solid_server_default_PodCreator,
  'configFilePath': getVariableValue('urn:solid-server:default:variable:seedConfig')
});
const df_1929_0 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_CreatePodHandler);
const urn_solid_server_default_AccountWebIdRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountWebIdRoute, urn_solid_server_default_WebIdHandler);
const df_1787_2 = new (require('@solid/community-server').SequenceHandler)([
  urn_solid_server_default_WebSocket2023Storer,
  urn_solid_server_default_WebSocket2023StateHandler
]);
const urn_solid_server_default_AccountPasswordIdRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountPasswordIdRoute, urn_solid_server_default_PasswordResourceHandler);
const urn_solid_server_default_AccountClientCredentialsIdRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountClientCredentialsIdRoute, urn_solid_server_default_ClientCredentialsResourceHandler);
const urn_solid_server_default_ListeningActivityHandler = new (require('@solid/community-server').ListeningActivityHandler)(urn_solid_server_default_SubscriptionStorage, urn_solid_server_default_ResourceStore, urn_solid_server_default_NotificationHandler);
const df_1717_4 = new (require('@solid/pivot').PivotOidcHttpHandler)(getVariableValue('urn:solid-server:default:variable:baseUrl'), urn_solid_server_default_ResponseWriter);
const urn_solid_server_default_AccountPodRouter = new (require('@solid/community-server').AuthorizedRouteHandler)(urn_solid_server_default_AccountPodRoute, df_1929_0);
const urn_solid_server_default_WebSocket2023Listener = new (require('@solid/community-server').WebSocket2023Listener)(urn_solid_server_default_SubscriptionStorage, df_1787_2, getVariableValue('urn:solid-server:default:variable:baseUrl'));
const df_1725_1 = new (require('@solid/community-server').WacAllowHttpHandler)({
  'credentialsExtractor': urn_solid_server_default_CredentialsExtractor,
  'modesExtractor': urn_solid_server_default_ModesExtractor,
  'permissionReader': urn_solid_server_default_PermissionReader,
  'operationHandler': urn_solid_server_default_OperationHandler
});
const urn_solid_server_default_NotificationDescriber = new (require('@solid/community-server').NotificationDescriber)(urn_solid_server_default_RepresentationConverter, [
  urn_solid_server_default_WebSocketChannel2023Type,
  urn_solid_server_default_WebhookChannel2023Type
]);
const urn_solid_server_default_IdentityProviderFactory = new (require('@solid/community-server').IdentityProviderFactory)({"claims":{"openid":["azp"],"webid":["webid"]},"clockTolerance":120,"cookies":{"long":{"maxAge":86400000,"signed":true},"short":{"signed":true}},"enabledJWA":{"dPoPSigningAlgValues":["RS256","RS384","RS512","PS256","PS384","PS512","ES256","ES256K","ES384","ES512","EdDSA"]},"features":{"claimsParameter":{"enabled":true},"clientCredentials":{"enabled":true},"dPoP":{"enabled":true},"devInteractions":{"enabled":false},"introspection":{"enabled":true},"registration":{"enabled":true},"revocation":{"enabled":true},"userinfo":{"enabled":false}},"scopes":["openid","profile","offline_access","webid"],"subjectTypes":["public"],"ttl":{"AccessToken":3600,"AuthorizationCode":600,"BackchannelAuthenticationRequest":600,"ClientCredentials":600,"DeviceCode":600,"Grant":1209600,"IdToken":3600,"Interaction":3600,"RefreshToken":86400,"Session":1209600}}, {
  'promptFactory': urn_solid_server_default_PromptFactory,
  'adapterFactory': urn_solid_server_default_IdpAdapterFactory,
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'oidcPath': '/.oidc',
  'interactionRoute': urn_solid_server_default_IndexRoute,
  'clientCredentialsStore': urn_solid_server_default_ClientCredentialsStore,
  'storage': urn_solid_server_default_KeyStorage,
  'jwkGenerator': urn_solid_server_default_JwkGenerator,
  'showStackTrace': getVariableValue('urn:solid-server:default:variable:showStackTrace'),
  'errorHandler': urn_solid_server_default_ErrorHandler,
  'responseWriter': urn_solid_server_default_ResponseWriter
});
const urn_solid_server_default_WebhookSubscriber = new (require('@solid/community-server').NotificationSubscriber)({
  'channelType': urn_solid_server_default_WebhookChannel2023Type,
  'converter': urn_solid_server_default_RepresentationConverter,
  'credentialsExtractor': urn_solid_server_default_CredentialsExtractor,
  'permissionReader': urn_solid_server_default_PermissionReader,
  'authorizer': urn_solid_server_default_Authorizer,
  'storage': urn_solid_server_default_SubscriptionStorage
});
const urn_solid_server_default_PrimaryParallelInitializer = new (require('@solid/community-server').ParallelHandler)([
  urn_solid_server_default_ListeningActivityHandler,
  urn_solid_server_default_StreamingHttpListeningActivityHandler,
  urn_solid_server_default_PasswordStore,
  urn_solid_server_default_AccountStore,
  urn_solid_server_default_ClientCredentialsStore,
  urn_solid_server_default_PodStore,
  urn_solid_server_default_WebIdStore
]);
const urn_solid_server_default_SubdomainOidcHandler = new (require('@solid/community-server').RouterHandler)({
  'targetExtractor': urn_solid_server_default_TargetExtractor,
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': df_1717_4,
  'allowedPathNames': [
  '/\.well-known/openid-configuration'
]
});
const df_1717_2 = new (require('@solid/community-server').OidcHttpHandler)(urn_solid_server_default_IdentityProviderFactory);
const df_1955_1 = new (require('@solid/community-server').ClientInfoHandler)(urn_solid_server_default_IdentityProviderFactory);
const df_1955_5 = new (require('@solid/community-server').ConsentHandler)(urn_solid_server_default_IdentityProviderFactory);
const df_1957_1 = new (require('@solid/community-server').ForgetWebIdHandler)(urn_solid_server_default_IdentityProviderFactory);
const urn_solid_server_default_PickWebIdHandler = new (require('@solid/community-server').PickWebIdHandler)(urn_solid_server_default_WebIdStore, urn_solid_server_default_IdentityProviderFactory);
const urn_solid_server_default_WebSocketHandler = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_WebSocket2023Listener
]);
const urn_solid_server_default_StorageDescriber = new (require('@solid/community-server').ArrayUnionHandler)([
  df_1765_6,
  urn_solid_server_default_NotificationDescriber
], undefined, undefined);
const df_1725_2 = new (require('@solid/community-server').AuthorizingHttpHandler)({
  'credentialsExtractor': urn_solid_server_default_CredentialsExtractor,
  'modesExtractor': urn_solid_server_default_ModesExtractor,
  'permissionReader': urn_solid_server_default_PermissionReader,
  'authorizer': urn_solid_server_default_Authorizer,
  'operationHandler': df_1725_1
});
const df_1955_2 = new (require('@solid/community-server').MethodFilterHandler)([
  'GET'
], df_1955_1);
const df_1955_6 = new (require('@solid/community-server').MethodFilterHandler)([
  'POST'
], df_1955_5);
const df_1957_2 = new (require('@solid/community-server').MethodFilterHandler)([
  'POST'
], df_1957_1);
const df_1961_0 = new (require('@solid/community-server').ViewInteractionHandler)(urn_solid_server_default_PickWebIdHandler);
const urn_solid_server_default_PrimarySequenceInitializer = new (require('@solid/community-server').SequenceHandler)([
  urn_solid_server_default_CleanupInitializer,
  urn_solid_server_default_MigrationInitializer,
  urn_solid_server_default_BaseUrlVerifier,
  urn_solid_server_default_PrimaryParallelInitializer,
  urn_solid_server_default_SeededAccountInitializer,
  urn_solid_server_default_ModuleVersionVerifier,
  urn_solid_server_default_WorkerManager
]);
const urn_solid_server_default_WebSocketServerConfigurator = new (require('@solid/community-server').WebSocketServerConfigurator)(urn_solid_server_default_WebSocketHandler);
const urn_solid_server_default_WebhookRouter = new (require('@solid/community-server').OperationRouterHandler)({
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': urn_solid_server_default_WebhookSubscriber,
  'allowedMethods': [
  'HEAD',
  'GET',
  'POST'
],
  'allowedPathNames': [
  '/WebhookChannel2023/$'
]
});
const df_1765_1 = new (require('@solid/community-server').StorageDescriptionHandler)(urn_solid_server_default_ResourceStore, '.well-known/solid', urn_solid_server_default_StorageDescriber);
const urn_solid_server_default_OidcHandler = new (require('@solid/community-server').RouterHandler)({
  'targetExtractor': urn_solid_server_default_TargetExtractor,
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': df_1717_2,
  'allowedPathNames': [
  '^/.oidc/.*',
  '^/\.well-known/openid-configuration'
]
});
const urn_solid_server_default_OidcPickWebIdRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_OidcPickWebIdRoute, df_1961_0);
const urn_solid_server_default_PrimaryInitializer = new (require('@solid/community-server').ProcessHandler)(urn_solid_server_default_PrimarySequenceInitializer, urn_solid_server_default_ClusterManager, true);
const df_1765_2 = new (require('@solid/community-server').ConvertingOperationHttpHandler)(urn_solid_server_default_RepresentationConverter, df_1765_1);
const urn_solid_server_default_ConsentHandler = new (require('@solid/community-server').WaterfallHandler)([
  df_1955_2,
  df_1955_6
]);
const urn_solid_server_default_ForgetWebIdHandler = new (require('@solid/community-server').WaterfallHandler)([
  df_1957_2
]);
const urn_solid_server_default_LdpHandler = new (require('@solid/community-server').ParsingHttpHandler)({
  'requestParser': urn_solid_server_default_RequestParser,
  'errorHandler': urn_solid_server_default_ErrorHandler,
  'responseWriter': urn_solid_server_default_ResponseWriter,
  'operationHandler': df_1725_2
});
const urn_solid_server_default_NotificationTypeHandler = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_StreamingHttp2023Router,
  urn_solid_server_default_WebSocket2023Router,
  urn_solid_server_default_WebhookRouter,
  urn_solid_server_default_WebhookWebId
]);
const urn_solid_server_default_OidcConsentRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_OidcConsentRoute, urn_solid_server_default_ConsentHandler);
const urn_solid_server_default_OidcForgetWebIdRouter = new (require('@solid/community-server').InteractionRouteHandler)(urn_solid_server_default_OidcForgetWebIDRoute, urn_solid_server_default_ForgetWebIdHandler);
const df_1777_7 = new (require('@solid/community-server').ConvertingOperationHttpHandler)(urn_solid_server_default_RepresentationConverter, urn_solid_server_default_NotificationTypeHandler);
const df_1765_3 = new (require('@solid/community-server').ParsingHttpHandler)({
  'requestParser': urn_solid_server_default_RequestParser,
  'errorHandler': urn_solid_server_default_ErrorHandler,
  'responseWriter': urn_solid_server_default_ResponseWriter,
  'operationHandler': df_1765_2
});
const urn_solid_server_default_InteractionRouteHandler = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_AccountRouter,
  urn_solid_server_default_AccountClientCredentialsRouter,
  urn_solid_server_default_AccountPodRouter,
  urn_solid_server_default_AccountWebIdRouter,
  urn_solid_server_default_AccountClientCredentialsIdRouter,
  urn_solid_server_default_AccountPodIdRouter,
  urn_solid_server_default_AccountWebIdLinkRouter,
  urn_solid_server_default_AccountLogoutRouter,
  urn_solid_server_default_IndexRouter,
  urn_solid_server_default_LoginRouter,
  urn_solid_server_default_OidcCancelRouter,
  urn_solid_server_default_OidcConsentRouter,
  urn_solid_server_default_OidcForgetWebIdRouter,
  urn_solid_server_default_OidcPromptRouter,
  urn_solid_server_default_OidcPickWebIdRouter,
  urn_solid_server_default_AccountPasswordRouter,
  urn_solid_server_default_ForgotPasswordRouter,
  urn_solid_server_default_LoginPasswordRouter,
  urn_solid_server_default_ResetPasswordRouter,
  urn_solid_server_default_AccountPasswordIdRouter
]);
const urn_solid_server_default_NotificationReadWriteHandler = new (require('@solid/community-server').OperationRouterHandler)({
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': df_1777_7,
  'allowedMethods': [
  'HEAD',
  'GET',
  'POST'
]
});
const urn_solid_server_default_LocationInteractionHandler = new (require('@solid/community-server').LocationInteractionHandler)(urn_solid_server_default_InteractionRouteHandler);
const urn_solid_server_default_StorageDescriptionHandler = new (require('@solid/community-server').RouterHandler)({
  'targetExtractor': urn_solid_server_default_TargetExtractor,
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': df_1765_3,
  'allowedPathNames': [
  '/\.well-known/solid'
]
});
const urn_solid_server_default_RootControlHandler = new (require('@solid/community-server').ControlHandler)({
  'controls': urn_solid_server_default_ControlHandler
}, urn_solid_server_default_LocationInteractionHandler);
const df_1777_3 = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_NotificationReadWriteHandler,
  urn_solid_server_default_NotificationDeleteHandler
]);
const urn_solid_server_default_CookieInteractionHandler = new (require('@solid/community-server').CookieInteractionHandler)(urn_solid_server_default_RootControlHandler, urn_solid_server_default_AccountStore, urn_solid_server_default_CookieStore);
const urn_solid_server_default_VersionHandler = new (require('@solid/community-server').VersionHandler)(urn_solid_server_default_CookieInteractionHandler);
const urn_solid_server_default_NotificationParsingHandler = new (require('@solid/community-server').ParsingHttpHandler)({
  'requestParser': urn_solid_server_default_RequestParser,
  'errorHandler': urn_solid_server_default_ErrorHandler,
  'responseWriter': urn_solid_server_default_ResponseWriter,
  'operationHandler': df_1777_3
});
const urn_solid_server_default_JsonConversionHandler = new (require('@solid/community-server').JsonConversionHandler)(urn_solid_server_default_VersionHandler, urn_solid_server_default_RepresentationConverter);
const urn_solid_server_default_LockingInteractionHandler = new (require('@solid/community-server').LockingInteractionHandler)(urn_solid_server_default_ResourceLocker, urn_solid_server_default_AccountIdRoute, urn_solid_server_default_JsonConversionHandler);
const urn_solid_server_default_NotificationHttpHandler = new (require('@solid/community-server').RouterHandler)({
  'targetExtractor': urn_solid_server_default_TargetExtractor,
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': urn_solid_server_default_NotificationParsingHandler,
  'allowedPathNames': [
  '^/.notifications/'
]
});
const urn_solid_server_default_InteractionHandler = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_HtmlViewHandler,
  urn_solid_server_default_LockingInteractionHandler
]);
const urn_solid_server_default_IdentityProviderHttpHandler = new (require('@solid/community-server').IdentityProviderHttpHandler)({
  'providerFactory': urn_solid_server_default_IdentityProviderFactory,
  'cookieStore': urn_solid_server_default_CookieStore,
  'handler': urn_solid_server_default_InteractionHandler
});
const urn_solid_server_default_IdentityProviderAuthorizingHandler = new (require('@solid/community-server').AuthorizingHttpHandler)({
  'credentialsExtractor': urn_solid_server_default_CredentialsExtractor,
  'modesExtractor': urn_solid_server_default_ModesExtractor,
  'permissionReader': df_1709_0,
  'authorizer': urn_solid_server_default_Authorizer,
  'operationHandler': urn_solid_server_default_IdentityProviderHttpHandler
});
const urn_solid_server_default_IdentityProviderParsingHandler = new (require('@solid/community-server').ParsingHttpHandler)({
  'requestParser': urn_solid_server_default_RequestParser,
  'errorHandler': urn_solid_server_default_ErrorHandler,
  'responseWriter': urn_solid_server_default_ResponseWriter,
  'operationHandler': urn_solid_server_default_IdentityProviderAuthorizingHandler
});
const urn_solid_server_default_IdentityProviderHandler = new (require('@solid/community-server').RouterHandler)({
  'targetExtractor': urn_solid_server_default_TargetExtractor,
  'baseUrl': getVariableValue('urn:solid-server:default:variable:baseUrl'),
  'handler': urn_solid_server_default_IdentityProviderParsingHandler,
  'allowedPathNames': [
  '^/.account/.*'
]
});
const urn_solid_server_default_BaseHttpHandler = new (require('@solid/community-server').WaterfallHandler)([
  urn_solid_server_default_StaticAssetHandler,
  urn_solid_server_default_OidcHandler,
  urn_solid_server_default_SubdomainOidcHandler,
  urn_pivot_default_FedcmHandler,
  urn_solid_server_default_NotificationHttpHandler,
  urn_solid_server_default_StorageDescriptionHandler,
  urn_solid_server_default_AuthResourceHttpHandler,
  urn_solid_server_default_IdentityProviderHandler,
  urn_solid_server_default_LdpHandler
]);
const urn_solid_server_default_HttpHandler = new (require('@solid/community-server').SequenceHandler)([
  urn_solid_server_default_Middleware,
  urn_solid_server_default_BaseHttpHandler
]);
const urn_solid_server_default_HandlerServerConfigurator = new (require('@solid/community-server').HandlerServerConfigurator)(urn_solid_server_default_HttpHandler, getVariableValue('urn:solid-server:default:variable:showStackTrace'));
const urn_solid_server_default_ServerConfigurator = new (require('@solid/community-server').ParallelHandler)([
  urn_solid_server_default_HandlerServerConfigurator,
  urn_solid_server_default_WebSocketServerConfigurator
]);
const urn_solid_server_default_ServerFactory = new (require('@solid/community-server').BaseServerFactory)(urn_solid_server_default_ServerConfigurator, {});
const urn_solid_server_default_ServerInitializer = new (require('@solid/community-server').ServerInitializer)(urn_solid_server_default_ServerFactory, getVariableValue('urn:solid-server:default:variable:port'), getVariableValue('urn:solid-server:default:variable:socket'));
const df_1695_4 = new (require('@solid/community-server').FinalizableHandler)(urn_solid_server_default_ServerInitializer);
const urn_solid_server_default_WorkerSequenceInitializer = new (require('@solid/community-server').SequenceHandler)([
  urn_solid_server_default_WorkerParallelInitializer,
  urn_solid_server_default_ServerInitializer
]);
const urn_solid_server_default_WorkerInitializer = new (require('@solid/community-server').ProcessHandler)(urn_solid_server_default_WorkerSequenceInitializer, urn_solid_server_default_ClusterManager, false);
const urn_solid_server_default_Finalizer = new (require('@solid/community-server').ParallelHandler)([
  df_1695_4
]);
const urn_solid_server_default_Initializer = new (require('@solid/community-server').SequenceHandler)([
  urn_solid_server_default_LoggerInitializer,
  urn_solid_server_default_EarlyProcessParallelInitializer,
  urn_solid_server_default_PrimaryInitializer,
  urn_solid_server_default_WorkerInitializer
]);
const df_1695_3 = new (require('@solid/community-server').SequenceHandler)([
  urn_solid_server_default_Finalizer,
  urn_solid_server_default_CleanupFinalizer
]);
const urn_solid_server_default_App = new (require('@solid/community-server').App)(urn_solid_server_default_Initializer, df_1695_3, urn_solid_server_default_ClusterManager);
return urn_solid_server_default_App;
}

