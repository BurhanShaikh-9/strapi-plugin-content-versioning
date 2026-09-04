"use strict";

const { v4: uuid } = require("uuid");
const { getService } = require("../utils");
const _ = require("lodash");

module.exports = ({ strapi }) => {
  return async (context, next) => {
    try {
      const { isVersionedContentType } = getService("content-types");
      const model = strapi.getModel(context.uid);

      if (!model || !isVersionedContentType(model)) {
        return await next();
      }

      // Read operations pass through directly
      if (context.action === "findMany" || context.action === "findPage" || context.action === "findOne") {
        return await next();
      }

      // Intercept create operation
      if (context.action === "create") {
        const { data } = context.params;
        if (data) {
          if (!data.vuid) {
            data.vuid = uuid();
            data.versionNumber = 1;
            data.isVisibleInListView = true;
          }
        }
        return await next();
      }

      // Intercept update and publish operations to snapshot previous version & increment version number
      if (context.action === "update" || context.action === "publish") {
        const docId = context.params?.documentId || context.params?.id || context.params?.where?.documentId;
        let currentRecord = null;
        if (docId) {
          currentRecord =
            (await strapi.db.query(context.uid).findOne({ where: { documentId: docId }, populate: ["createdBy", "updatedBy"] })) ||
            (await strapi.db.query(context.uid).findOne({ where: { id: docId }, populate: ["createdBy", "updatedBy"] }));
        }

        if (currentRecord && !context.params?.doNotCreateVersion) {
          let recordVuid = currentRecord.vuid || (context.params.data && context.params.data.vuid);
          if (!recordVuid) {
            recordVuid = uuid();
            await strapi.db.query(context.uid).update({
              where: { id: currentRecord.id },
              data: { vuid: recordVuid, versionNumber: 1, isVisibleInListView: true },
            });
          }

          if (context.params.data) {
            context.params.data.vuid = recordVuid;
          }

          // Fetch existing versions for this vuid to determine current max version number
          const existingVersions = await strapi.db.query(context.uid).findMany({
            where: { vuid: recordVuid },
          });

          const maxVersion = _.maxBy(existingVersions || [], (v) => Number(v.versionNumber || 1));
          const currentMaxNum = maxVersion ? Number(maxVersion.versionNumber || 1) : Number(currentRecord.versionNumber || 1);

          // Create historic snapshot row for previous version
          try {
              // Fetch deep document payload (including media, components, relations)
            let fullDocument = null;
            const targetDocId = currentRecord.documentId || docId;
            if (targetDocId) {
              try {
                fullDocument =
                  (await strapi.documents(context.uid).findOne({
                    documentId: targetDocId,
                    status: "draft",
                    populate: "*",
                  })) ||
                  (await strapi.documents(context.uid).findOne({
                    documentId: targetDocId,
                    status: "published",
                    populate: "*",
                  }));
              } catch (docErr) {
                // Ignore findOne error and fallback to currentRecord
              }
            }

            const snapshotData = {};
            const attributes = model.attributes || {};
            for (const key of Object.keys(attributes)) {
              const attr = attributes[key];
              if (attr.type !== "relation" && currentRecord[key] !== undefined && currentRecord[key] !== null) {
                if (attr.unique === true && typeof currentRecord[key] === "string") {
                  snapshotData[key] = `${currentRecord[key]}__ver_${currentMaxNum}_${Date.now()}`;
                } else {
                  snapshotData[key] = currentRecord[key];
                }
              }
            }
            snapshotData.vuid = recordVuid;
            snapshotData.versionNumber = currentMaxNum;
            snapshotData.isVisibleInListView = false;
            snapshotData.versionData = fullDocument || currentRecord;
            snapshotData.createdAt = new Date().toISOString();
            snapshotData.updatedAt = new Date().toISOString();

            await strapi.db.query(context.uid).create({
              data: snapshotData,
            });
          } catch (snapErr) {
            strapi.log.warn(`[versioning snapshot notice]: ${snapErr.message}`);
          }

          const nextVer = currentMaxNum + 1;
          if (context.params.data) {
            context.params.data.versionNumber = nextVer;
            context.params.data.isVisibleInListView = true;
          }

          // Update currentRecord's versionNumber and vuid directly in DB
          await strapi.db.query(context.uid).update({
            where: { id: currentRecord.id },
            data: { versionNumber: nextVer, vuid: recordVuid, isVisibleInListView: true },
          });
        }
        return await next();
      }

      return await next();
    } catch (err) {
      strapi.log.error(`[content-versioning middleware error]: ${err.message}`, err);
      return await next();
    }
  };
};
