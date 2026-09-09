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

      // Intercept clone operation to give the duplicated document its own fresh vuid & version 1
      if (context.action === "clone") {
        const freshVuid = uuid();
        if (!context.params.data) {
          context.params.data = {};
        }
        context.params.data.vuid = freshVuid;
        context.params.data.versionNumber = 1;
        context.params.data.isVisibleInListView = true;

        const result = await next();

        // Ensure newly cloned document rows in DB get the fresh vuid & version 1
        const clonedDocId =
          result?.documentId ||
          (result?.entries && result.entries[0]?.documentId) ||
          result?.id;

        if (clonedDocId) {
          try {
            await strapi.db.query(context.uid).updateMany({
              where: {
                $or: [
                  { documentId: clonedDocId },
                  { id: Number(clonedDocId) || 0 },
                ],
              },
              data: {
                vuid: freshVuid,
                versionNumber: 1,
                isVisibleInListView: true,
              },
            });
          } catch (cloneErr) {
            strapi.log.warn(`[content-versioning clone sync error]: ${cloneErr.message}`);
          }
        }
        return result;
      }

      // Intercept create operation
      if (context.action === "create") {
        const { data } = context.params;
        if (data) {
          // If creating a new document (not an extra locale for an existing document), assign fresh vuid
          const isNewDoc = !context.params.documentId;
          if (isNewDoc || !data.vuid) {
            data.vuid = uuid();
            data.versionNumber = 1;
            data.isVisibleInListView = true;
          }
        }
        return await next();
      }

      // For update operations: ensure vuid is assigned without creating new version snapshots
      if (context.action === "update") {
        const docId = context.params?.documentId || context.params?.id || context.params?.where?.documentId;
        if (docId) {
          const currentRecord =
            (await strapi.db.query(context.uid).findOne({ where: { documentId: docId } })) ||
            (await strapi.db.query(context.uid).findOne({ where: { id: docId } }));

          if (currentRecord) {
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
          }
        }
        return await next();
      }

      // Intercept publish operation to snapshot previous version & increment version number
      if (context.action === "publish" || context.params?.createVersion) {
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

          // Check if this document already has an active published record in the database
          let existingPublished = null;
          if (currentRecord.documentId) {
            existingPublished = await strapi.db.query(context.uid).findOne({
              where: {
                documentId: currentRecord.documentId,
                publishedAt: { $notNull: true },
                isVisibleInListView: true,
              },
            });
          } else if (recordVuid) {
            existingPublished = await strapi.db.query(context.uid).findOne({
              where: {
                vuid: recordVuid,
                publishedAt: { $notNull: true },
                isVisibleInListView: true,
              },
            });
          }

          const isInitialPublish = !existingPublished;
          let nextVer = 1;

          if (!isInitialPublish) {
            // Fetch existing historic snapshots for this vuid to determine snapshot version
            const historicSnapshots = await strapi.db.query(context.uid).findMany({
              where: { vuid: recordVuid, isVisibleInListView: false },
            });

            const highestSnapshotNum =
              _.max((historicSnapshots || []).map((s) => Number(s.versionNumber || 0))) || 0;
            const currentActiveNum = Number(currentRecord.versionNumber || 1);

            const newSnapshotVer = Math.max(highestSnapshotNum + 1, currentActiveNum);
            nextVer = Math.min(newSnapshotVer + 1, 10);

          // Create historic snapshot row for previous version
          try {
            // Fetch deep document payload (including media, components, dynamic zones, relations)
            const buildDeepPopulate = (modelUid, depth = 0) => {
              if (depth > 5) return true;
              const m = strapi.getModel(modelUid);
              if (!m) return true;
              const pop = {};
              for (const [k, a] of Object.entries(m.attributes || {})) {
                if (a.type === "component") {
                  pop[k] = { populate: buildDeepPopulate(a.component, depth + 1) };
                } else if (a.type === "dynamiczone") {
                  const on = {};
                  for (const compUid of a.components || []) {
                    on[compUid] = { populate: buildDeepPopulate(compUid, depth + 1) };
                  }
                  pop[k] = { on };
                } else if (a.type === "media" || a.type === "relation") {
                  pop[k] = true;
                }
              }
              return pop;
            };

            let fullDocument = null;
            try {
              const deepPop = buildDeepPopulate(context.uid);
              fullDocument = await strapi.documents(context.uid).findOne({
                documentId: currentRecord.documentId,
                status: "published",
                populate: deepPop,
                ...(currentRecord.locale ? { locale: currentRecord.locale } : {}),
              });
            } catch (docErr) {
              try {
                const deepPop = buildDeepPopulate(context.uid);
                fullDocument = await strapi.documents(context.uid).findOne({
                  documentId: currentRecord.documentId,
                  status: "draft",
                  populate: deepPop,
                  ...(currentRecord.locale ? { locale: currentRecord.locale } : {}),
                });
              } catch (err2) {
                fullDocument = currentRecord;
              }
            }

            const snapshotData = {};
            const attributes = model.attributes || {};
            for (const key of Object.keys(attributes)) {
              const attr = attributes[key];
              if (attr.type !== "relation" && currentRecord[key] !== undefined && currentRecord[key] !== null) {
                if (attr.unique === true && typeof currentRecord[key] === "string") {
                  snapshotData[key] = `${currentRecord[key]}__ver_${newSnapshotVer}_${Date.now()}`;
                } else {
                  snapshotData[key] = currentRecord[key];
                }
              }
            }
            snapshotData.vuid = recordVuid;
            snapshotData.versionNumber = newSnapshotVer;
            snapshotData.isVisibleInListView = false;
            snapshotData.versionData = fullDocument || currentRecord;
            snapshotData.createdAt = new Date().toISOString();
            snapshotData.updatedAt = new Date().toISOString();

            await strapi.db.query(context.uid).create({
              data: snapshotData,
            });

            // Enforce maximum revisions limit (10 total: max 9 historic snapshots + 1 current active)
            const MAX_HISTORIC_SNAPSHOTS = 9;
            const allSnapshots = await strapi.db.query(context.uid).findMany({
              where: { vuid: recordVuid, isVisibleInListView: false },
              sort: [{ createdAt: "asc" }, { id: "asc" }],
            });

            if (allSnapshots && allSnapshots.length > MAX_HISTORIC_SNAPSHOTS) {
              const toPurge = allSnapshots.slice(0, allSnapshots.length - MAX_HISTORIC_SNAPSHOTS);
              for (const snap of toPurge) {
                await strapi.db.query(context.uid).delete({
                  where: { id: snap.id },
                });
              }
            }

            // Renumber remaining historic snapshots sequentially 1..9 in database
            const remainingSnapshots = await strapi.db.query(context.uid).findMany({
              where: { vuid: recordVuid, isVisibleInListView: false },
              sort: [{ createdAt: "asc" }, { id: "asc" }],
            });

            for (let i = 0; i < remainingSnapshots.length; i++) {
              if (Number(remainingSnapshots[i].versionNumber) !== i + 1) {
                await strapi.db.query(context.uid).update({
                  where: { id: remainingSnapshots[i].id },
                  data: { versionNumber: i + 1 },
                });
              }
            }

            nextVer = Math.min(remainingSnapshots.length + 1, 10);
          } catch (snapErr) {
            strapi.log.warn(`[versioning snapshot notice]: ${snapErr.message}`);
          }
        }

          if (context.params?.data) {
            context.params.data.versionNumber = nextVer;
            context.params.data.isVisibleInListView = true;
          }

          // Execute publish first so Strapi completes its publish lifecycle
          const result = await next();

          // After publish completes, synchronize nextVer to ALL active rows (both draft and published)
          try {
            await strapi.db.query(context.uid).updateMany({
              where: {
                vuid: recordVuid,
                isVisibleInListView: true,
              },
              data: {
                versionNumber: nextVer,
                vuid: recordVuid,
                isVisibleInListView: true,
              },
            });

            if (docId) {
              await strapi.db.query(context.uid).updateMany({
                where: {
                  documentId: docId,
                },
                data: {
                  versionNumber: nextVer,
                  vuid: recordVuid,
                  isVisibleInListView: true,
                },
              });
            }
          } catch (syncErr) {
            strapi.log.warn(`[content-versioning post-publish sync error]: ${syncErr.message}`);
          }

          return result;
        }
      }

      return await next();
    } catch (err) {
      strapi.log.error(`[content-versioning middleware error]: ${err.message}`, err);
      return await next();
    }
  };
};
