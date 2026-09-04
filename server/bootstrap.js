"use strict";

const _ = require("lodash");
const { getService } = require("./utils");

module.exports = async ({ strapi }) => {
  const { actions } = getService("permissions");

  // Ensure DB schema (columns and relation tables) exists for all versioned content types
  await ensureVersionedDBSchema(strapi);

  strapi.server.router.use(
    "/content-manager/collection-types/:model",
    (ctx, next) => {
      if (ctx.method === "POST") {
        delete ctx.request.body.vuid;
        delete ctx.request.body.versionNumber;
        delete ctx.request.body.versions;
      }

      return next();
    }
  );

  // Actions
  await actions.registerVersionsActions();

  // Hooks & Models
  registerModelsHooks();
};

const ensureVersionedDBSchema = async (strapi) => {
  const versionedModels = Object.values(strapi.contentTypes).filter((contentType) =>
    getService("content-types").isVersionedContentType(contentType)
  );

  for (const model of versionedModels) {
    const collectionName = model.collectionName;
    const attrName = _.snakeCase(model.info.singularName);

    try {
      // 1. Ensure columns exist on the content-type table
      const hasVuid = await strapi.db.connection.schema.hasColumn(collectionName, "vuid");
      if (!hasVuid) {
        await strapi.db.connection.schema.alterTable(collectionName, (table) => {
          table.string("vuid").nullable();
        });
      }

      const hasVersionNumber = await strapi.db.connection.schema.hasColumn(collectionName, "version_number");
      if (!hasVersionNumber) {
        await strapi.db.connection.schema.alterTable(collectionName, (table) => {
          table.integer("version_number").defaultTo(1);
        });
      }

      const hasVersionComment = await strapi.db.connection.schema.hasColumn(collectionName, "version_comment");
      if (!hasVersionComment) {
        await strapi.db.connection.schema.alterTable(collectionName, (table) => {
          table.string("version_comment").nullable();
        });
      }

      const hasIsVisibleInListView = await strapi.db.connection.schema.hasColumn(collectionName, "is_visible_in_list_view");
      if (!hasIsVisibleInListView) {
        await strapi.db.connection.schema.alterTable(collectionName, (table) => {
          table.boolean("is_visible_in_list_view").defaultTo(true);
        });
      }

      const hasVersionData = await strapi.db.connection.schema.hasColumn(collectionName, "version_data");
      if (!hasVersionData) {
        await strapi.db.connection.schema.alterTable(collectionName, (table) => {
          table.json("version_data").nullable();
        });
      }

      // Update null values for existing records using cross-database Knex queries
      await strapi.db
        .connection(collectionName)
        .whereNull("is_visible_in_list_view")
        .update({ is_visible_in_list_view: true });

      await strapi.db
        .connection(collectionName)
        .whereNull("version_number")
        .update({ version_number: 1 });

      // 2. Ensure relation link tables exist (both _lnk and _links for compatibility)
      const linkTableNames = [
        `${collectionName}_versions_lnk`,
        `${collectionName}_versions_links`
      ];

      for (const linkTableName of linkTableNames) {
        const hasLinkTable = await strapi.db.connection.schema.hasTable(linkTableName);
        if (!hasLinkTable) {
          await strapi.db.connection.schema.createTable(linkTableName, (table) => {
            table.increments("id");
            table.integer(`${attrName}_id`).nullable();
            table.integer(`inv_${attrName}_id`).nullable();
            table.integer(`${attrName}_ord`).nullable();
          });
        }
      }
    } catch (err) {
      strapi.log.warn(`[content-versioning] Schema ensure notice for ${collectionName}: ${err.message}`);
    }
  }
};

const registerModelsHooks = () => {
  const versionedModelUIDs = Object.values(strapi.contentTypes)
    .filter((contentType) =>
      getService("content-types").isVersionedContentType(contentType)
    )
    .map((contentType) => contentType.uid);

  if (versionedModelUIDs.length > 0) {
    strapi.db.lifecycles.subscribe({
      models: versionedModelUIDs,
      async beforeCreate(event) {
        await getService("lifecycles").beforeCreate(event);
      },
      async beforeUpdate(event) {
        await getService("lifecycles").beforeUpdate(event);
      },
      async beforeDelete(event) {
        await getService("lifecycles").beforeDelete(event);
      },
    });
  }
};
