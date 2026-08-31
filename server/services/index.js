"use strict";

const permissions = require("./permissions");
const coreApi = require("./core-api");
const contentTypes = require("./content-types");
const lifecycles = require("./lifecycles");
const documentServiceMiddleware = require('./document-service-middleware');

module.exports = {
  permissions,
  "core-api": coreApi,
  "content-types": contentTypes,
  lifecycles: lifecycles,
  'document-service-middleware': documentServiceMiddleware,
};
