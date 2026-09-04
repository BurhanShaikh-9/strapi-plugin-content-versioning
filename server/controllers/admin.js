"use strict";

const { v4: uuid } = require("uuid");
const { getService } = require("../utils");
const { pick, uniqBy } = require("lodash");

module.exports = {
  async save(ctx) {
    const { slug } = ctx.request.params;
    const { body: data } = ctx.request;
    const { user } = ctx.state;

    const { createVersion } = getService("core-api");

    // Clone version tree
    if (data.isDuplicatingEntry) {
      const allVersions = await strapi.db.query(slug).findMany({
        where: {
          vuid: data.vuid,
        },
        sort: [{ versionNumber: "asc" }],
      });

      let initialCloneVersion = null;
      const newVuid = uuid();

      for (const versionData of allVersions) {
        versionData.vuid = newVuid;
        const created = await createVersion(slug, versionData, user, {});

        if (
          created.locale == data.locale &&
          created.versionNumber == data.versionNumber
        ) {
          initialCloneVersion = created;
        }
      }
      return initialCloneVersion;
    }

    return await createVersion(slug, data, user, ctx.request.query);
  },
  async updateVersion(ctx) {
    const { slug, id } = ctx.request.params;
    const { body: data } = ctx.request;
    const model = strapi.getModel(slug);
    const updatableKeys = Object.keys(model.attributes).filter(
      (key) =>
        ![
          "id",
          "createdBy",
          "updatedBy",
          "publishedAt",
          "createdAt",
          "updatedAt",
          "versions",
          "vuid",
          "versionNumber",
          "versionComment",
          "isVisibleInListView",
        ].includes(key)
    );

    const updateData = pick(data, updatableKeys);

    const updatedVersion = await strapi.documents(slug).update({
      documentId: id,
      data: updateData,
    });
    return updatedVersion;
  },
  async getVersions(ctx) {
    const { slug, vuid: paramId } = ctx.request.params;
    try {
      if (!paramId || paramId === "undefined" || paramId === "null") {
        return [];
      }

      // 1. Check if paramId matches a vuid directly
      let versions = await strapi.db.query(slug).findMany({
        where: { vuid: paramId },
        populate: ["createdBy", "updatedBy"],
        sort: [{ versionNumber: "asc" }],
        limit: 10,
      });

      if (versions && versions.length > 0) {
        return uniqBy(versions, "versionNumber");
      }

      // 2. If no versions found by vuid, resolve entry by documentId or id
      const foundEntry =
        (await strapi.db.query(slug).findOne({ where: { documentId: paramId }, populate: ["createdBy", "updatedBy"] })) ||
        (await strapi.db.query(slug).findOne({ where: { id: paramId }, populate: ["createdBy", "updatedBy"] }));

      if (foundEntry) {
        let entryVuid = foundEntry.vuid;
        if (!entryVuid) {
          entryVuid = uuid();
          await strapi.db.query(slug).update({
            where: { id: foundEntry.id },
            data: { vuid: entryVuid, versionNumber: 1, isVisibleInListView: true },
          });
          foundEntry.vuid = entryVuid;
          foundEntry.versionNumber = 1;
        }

        // Search for all versions matching entryVuid
        versions = await strapi.db.query(slug).findMany({
          where: { vuid: entryVuid },
          populate: ["createdBy", "updatedBy"],
          sort: [{ versionNumber: "asc" }],
          limit: 10,
        });

        if (versions && versions.length > 0) {
          return uniqBy(versions, "versionNumber");
        }

        return [foundEntry];
      }

      return [];
    } catch (err) {
      strapi.log.error("[getVersions controller error]:", err);
      return [];
    }
  },
  async revertVersion(ctx) {
    const { slug } = ctx.request.params;
    const { versionId } = ctx.request.body || {};

    if (!slug || !versionId) {
      return ctx.badRequest("slug and versionId are required");
    }

    try {
      const historicVersion =
        (await strapi.db.query(slug).findOne({ where: { documentId: versionId } })) ||
        (await strapi.db.query(slug).findOne({ where: { id: versionId } }));

      if (!historicVersion) {
        return ctx.notFound("Historic version not found");
      }

      const activeEntry =
        (await strapi.db.query(slug).findOne({
          where: { vuid: historicVersion.vuid, isVisibleInListView: true },
        })) ||
        (await strapi.db.query(slug).findOne({
          where: { documentId: historicVersion.documentId },
        }));

      if (!activeEntry) {
        return ctx.notFound("Active entry not found");
      }

      const model = strapi.getModel(slug);
      let sourceData = historicVersion.versionData;
      if (typeof sourceData === "string") {
        try {
          sourceData = JSON.parse(sourceData);
        } catch (e) {
          sourceData = null;
        }
      }
      if (!sourceData) {
        sourceData = historicVersion;
      }

      const cleanComponentData = (item) => {
        if (!item) return item;
        if (Array.isArray(item)) return item.map(cleanComponentData);
        if (typeof item === "object") {
          const cleaned = {};
          for (const k of Object.keys(item)) {
            if (k === "id") continue;
            cleaned[k] = cleanComponentData(item[k]);
          }
          return cleaned;
        }
        return item;
      };

      const extractEntityRef = (val) => {
        if (!val) return null;
        if (Array.isArray(val)) {
          return val.map((v) => (v && (v.documentId || v.id)) || v).filter(Boolean);
        }
        if (typeof val === "object") {
          return val.documentId || val.id || null;
        }
        return val;
      };

      const systemFields = [
        "id",
        "documentId",
        "createdAt",
        "updatedAt",
        "publishedAt",
        "vuid",
        "versionNumber",
        "versionComment",
        "versionData",
        "isVisibleInListView",
        "createdBy",
        "updatedBy",
      ];

      const restoreData = {};
      for (const key of Object.keys(model.attributes || {})) {
        if (systemFields.includes(key)) continue;

        const attr = model.attributes[key];
        let val = sourceData[key];
        if (val === undefined || val === null) continue;

        if (attr.type === "component" || attr.type === "dynamiczone") {
          restoreData[key] = cleanComponentData(val);
        } else if (attr.type === "media") {
          restoreData[key] = extractEntityRef(val);
        } else if (attr.type === "relation") {
          restoreData[key] = extractEntityRef(val);
        } else {
          if (attr.unique === true && typeof val === "string") {
            val = val.replace(/__ver_\d+_\d+$|_v\d+_\d+$/, "");
          }
          restoreData[key] = val;
        }
      }

      const updated = await strapi.documents(slug).update({
        documentId: activeEntry.documentId,
        data: restoreData,
      });

      return ctx.send({ ok: true, data: updated });
    } catch (err) {
      strapi.log.error("[revertVersion controller error]:", err);
      return ctx.badRequest(err.message);
    }
  },
};
