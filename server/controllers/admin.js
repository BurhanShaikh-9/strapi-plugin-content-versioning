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

      const formatVersionsList = (rawVersions) => {
        if (!rawVersions || rawVersions.length === 0) return [];

        const historic = rawVersions.filter((v) => !v.isVisibleInListView);
        const active = rawVersions.filter((v) => v.isVisibleInListView);

        // Most recent active record
        const currentActive = active.length > 0 ? active[0] : null;

        // Sort historic snapshots ascending chronologically
        const sortedHistoric = [...historic].sort((a, b) => {
          const timeA = new Date(a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt || 0).getTime();
          return timeA - timeB || Number(a.id || 0) - Number(b.id || 0);
        });

        // Enforce maximum 10 revisions in total (at most 9 historic snapshots + 1 active)
        const MAX_HISTORIC_DISPLAY = 9;
        const boundedHistoric = sortedHistoric.slice(-MAX_HISTORIC_DISPLAY);

        const result = boundedHistoric.map((h, idx) => ({
          ...h,
          versionNumber: idx + 1,
          isCurrent: false,
        }));

        if (currentActive) {
          result.push({
            ...currentActive,
            createdAt: currentActive.updatedAt || currentActive.publishedAt || currentActive.createdAt,
            versionNumber: result.length + 1,
            isCurrent: true,
          });
        }

        return result;
      };

      // 1. Check if paramId matches a vuid directly
      let versions = await strapi.db.query(slug).findMany({
        where: { vuid: paramId },
        populate: ["createdBy", "updatedBy"],
        sort: [{ id: "desc" }],
      });

      if (versions && versions.length > 0) {
        return formatVersionsList(versions);
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
          sort: [{ id: "desc" }],
        });

        if (versions && versions.length > 0) {
          return formatVersionsList(versions);
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
    const { versionId, currentDocumentId, versionNumber } = ctx.request.body || {};

    if (!slug || !versionId) {
      return ctx.badRequest("slug and versionId are required");
    }

    try {
      let historicVersion = null;
      // Safely query by documentId (only if versionId is a string and not purely digits to avoid pg type cast error)
      if (typeof versionId === "string" && !/^\d+$/.test(versionId)) {
        try {
          historicVersion = await strapi.db.query(slug).findOne({ where: { documentId: versionId } });
        } catch (e) {
          // ignore lookup error and fallback to id
        }
      }
      if (!historicVersion) {
        historicVersion = await strapi.db.query(slug).findOne({
          where: { id: Number(versionId) || versionId },
        });
      }

      if (!historicVersion) {
        return ctx.notFound("Historic version not found");
      }

      let targetDocumentId = currentDocumentId;
      if (!targetDocumentId) {
        // Resolve entry that actually has a non-null documentId
        const activeEntryWithDocId =
          (await strapi.db.query(slug).findOne({
            where: {
              vuid: historicVersion.vuid,
              documentId: { $notNull: true },
            },
            orderBy: { id: "desc" },
          })) ||
          (await strapi.db.query(slug).findOne({
            where: {
              documentId: { $notNull: true },
              isVisibleInListView: true,
            },
            orderBy: { id: "desc" },
          }));
        targetDocumentId = activeEntryWithDocId?.documentId || historicVersion.documentId;
      }

      if (!targetDocumentId) {
        return ctx.notFound("Active document not found");
      }

      // Auto-repair: if any draft row with this vuid has documentId: null, backfill it
      try {
        await strapi.db.query(slug).updateMany({
          where: {
            vuid: historicVersion.vuid,
            documentId: null,
          },
          data: {
            documentId: targetDocumentId,
          },
        });
      } catch (repairErr) {
        strapi.log.warn(`[revertVersion auto-repair notice]: ${repairErr.message}`);
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
        const buildDeepPopulate = (modelUid, depth = 0) => {
          if (depth > 5) return true;
          const m = strapi.getModel(modelUid);
          if (!m) return true;
          const pop = {};
          for (const [k, a] of Object.entries(m.attributes || {})) {
            if (a.type === "component") {
              const nested = buildDeepPopulate(a.component, depth + 1);
              pop[k] = { populate: Object.keys(nested || {}).length > 0 ? nested : "*" };
            } else if (a.type === "dynamiczone") {
              const on = {};
              for (const compUid of a.components || []) {
                const nested = buildDeepPopulate(compUid, depth + 1);
                on[compUid] = { populate: Object.keys(nested || {}).length > 0 ? nested : "*" };
              }
              pop[k] = { on };
            } else if (a.type === "media" || a.type === "relation") {
              pop[k] = true;
            }
          }
          return pop;
        };

        try {
          sourceData = await strapi.documents(slug).findOne({
            documentId: historicVersion.documentId,
            populate: buildDeepPopulate(slug),
          });
        } catch (e) {
          sourceData = historicVersion;
        }
      }

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

      const cleanComponentData = (item) => {
        if (!item) return item;
        if (Array.isArray(item)) return item.map(cleanComponentData);
        if (typeof item === "object") {
          // If this object represents a media file or relation reference, preserve identifier
          if (item.mime !== undefined || item.provider !== undefined || item.hash !== undefined) {
            return item.id || item.documentId || item;
          }
          const cleaned = {};
          for (const k of Object.keys(item)) {
            if (k === "id" || k === "createdAt" || k === "updatedAt") continue;
            cleaned[k] = cleanComponentData(item[k]);
          }
          return cleaned;
        }
        return item;
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
        "locale",
        "localizations",
      ];

      const restoreData = {};
      for (const key of Object.keys(model.attributes || {})) {
        if (systemFields.includes(key)) continue;

        const attr = model.attributes[key];
        let val = sourceData[key];

        if (val === undefined || val === null) {
          if (
            attr.type === "dynamiczone" ||
            (attr.type === "component" && attr.repeatable) ||
            (attr.type === "relation" && attr.relation?.endsWith("ToMany"))
          ) {
            restoreData[key] = [];
          } else {
            restoreData[key] = null;
          }
          continue;
        }

        if (attr.type === "component" || attr.type === "dynamiczone") {
          restoreData[key] = cleanComponentData(val);
        } else if (attr.type === "media" || attr.type === "relation") {
          restoreData[key] = extractEntityRef(val);
        } else {
          if (attr.unique === true && typeof val === "string") {
            val = val.replace(/__ver_\d+_\d+$|_v\d+_\d+$/, "");
          }
          restoreData[key] = val;
        }
      }

      const revertedVersionNum = Number(historicVersion.versionNumber || versionNumber || 1);
      restoreData.versionNumber = revertedVersionNum;
      restoreData.vuid = historicVersion.vuid;
      restoreData.isVisibleInListView = true;

      let updated = null;
      try {
        updated = await strapi.documents(slug).update({
          documentId: targetDocumentId,
          status: "draft",
          data: restoreData,
          doNotCreateVersion: true,
          ...(historicVersion.locale ? { locale: historicVersion.locale } : {}),
        });
      } catch (docErr) {
        strapi.log.warn(`[revertVersion Document Service notice, falling back to direct DB update]: ${docErr.message}`);
        // Direct DB update fallback for draft row
        const draftRow = await strapi.db.query(slug).findOne({
          where: {
            vuid: historicVersion.vuid,
            publishedAt: null,
          },
        });
        if (draftRow) {
          await strapi.db.query(slug).update({
            where: { id: draftRow.id },
            data: {
              ...restoreData,
              documentId: targetDocumentId,
              versionNumber: revertedVersionNum,
              vuid: historicVersion.vuid,
              isVisibleInListView: true,
            },
          });
          updated = draftRow;
        } else {
          throw docErr;
        }
      }

      // Synchronize draft metadata in DB
      try {
        await strapi.db.query(slug).updateMany({
          where: { documentId: targetDocumentId },
          data: {
            versionNumber: revertedVersionNum,
            vuid: historicVersion.vuid,
            isVisibleInListView: true,
          },
        });
      } catch (dbErr) {
        // ignore
      }

      return ctx.send({ ok: true, data: updated, versionNumber: revertedVersionNum });
    } catch (err) {
      strapi.log.error("[revertVersion controller error]:", err);
      return ctx.badRequest(err.message);
    }
  },
};
