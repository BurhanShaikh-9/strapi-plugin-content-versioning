"use strict";
//@ts-check

const _ = require("lodash");

const { getService } = require("./utils");

const enableContentType = require("./migrations/content-type/enable");
const disableContentType = require("./migrations/content-type/disable");
const { relationUpdateMiddleware } = require("./middlewares");

const documentServiceMiddleware = require("./services/document-service-middleware");

module.exports = ({ strapi }) => {
  extendVersionedContentTypes(strapi);
  // addStrapiVersioningMiddleware(strapi);
  addContentTypeSyncHooks(strapi);
  
  // Register the Document Service middleware
  strapi.documents.use(documentServiceMiddleware({ strapi }));
};

/**
 * Adds hooks to migration content types versions on enable/disable of versioning
 * @param {Strapi} strapi
 */
const addContentTypeSyncHooks = (strapi) => {
  // Disabled deprecated Strapi 4 hooks in Strapi 5
};

/**
 * Adds version fields to versioned content types
 * @param {Strapi} strapi
 */
const extendVersionedContentTypes = (strapi) => {
  const contentTypeService = getService("content-types");

  Object.values(strapi.contentTypes).forEach((contentType) => {
    if (contentTypeService.isVersionedContentType(contentType)) {
      const { attributes } = contentType;

      _.set(attributes, "vuid", {
        writable: true,
        private: false,
        configurable: false,
        visible: false,
        type: "string",
      });

      _.set(attributes, "versionNumber", {
        writable: true,
        private: false,
        configurable: false,
        visible: false,
        type: "integer",
        default: 1,
      });

      _.set(attributes, "versionComment", {
        writable: true,
        private: false,
        configurable: false,
        visible: false,
        type: "string",
      });

      _.set(attributes, "isVisibleInListView", {
        writable: true,
        private: false,
        configurable: false,
        visible: false,
        type: "boolean",
        default: true,
      });
    }
  });
};

/**
 * Adds middlewares on CM publish routes
 * @param {Strapi} strapi
 */
const addStrapiVersioningMiddleware = (strapi) => {
  strapi.server.router.use(
    [
      "/content-manager/collection-types/:model/:id/actions/publish",
      "/content-manager/collection-types/:model/:id/publish",
    ],
    async (ctx, next) => {
      if (ctx.method === "POST") {
        try {
          await relationUpdateMiddleware(ctx, async () => {});
        } catch (err) {
          strapi.log.warn("[relationUpdateMiddleware notice]:", err);
        }
      }

      return await next();
    }
  );
};
