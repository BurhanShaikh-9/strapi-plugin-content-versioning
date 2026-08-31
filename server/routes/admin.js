"use strict";

module.exports = [
  {
    method: "POST",
    path: "/:slug/revert-version",
    handler: "admin.revertVersion",
    config: {
      policies: [],
    },
  },
  {
    method: "GET",
    path: "/:slug/:vuid/versions",
    handler: "admin.getVersions",
    config: {
      policies: [],
    },
  },
  {
    method: "POST",
    path: "/:slug/save",
    handler: "admin.save",
    config: {
      policies: [
        "admin::isAuthenticatedAdmin",
        {
          name: "admin::hasPermissions",
          config: {
            actions: ["plugin::content-versioning.save"],
          },
        },
      ],
    },
  },
  {
    method: "PUT",
    path: "/:slug/:id/update-version",
    handler: "admin.updateVersion",
    config: {
      policies: [
        "admin::isAuthenticatedAdmin",
        {
          name: "admin::hasPermissions",
          config: {
            actions: ["plugin::content-versioning.save"],
          },
        },
      ],
    },
  },
];
