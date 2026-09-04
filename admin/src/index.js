import * as yup from "yup";
import pluginPkg from "../../package.json";
import pluginId from "./pluginId";
import Initializer from "./components/Initializer";
import middlewares from "./middlewares";
import Versions, { VersionsSidePanel } from "./components/Versions";
import CheckboxConfirmation from "./components/CheckboxConfirmation";
import mutateCTBContentTypeSchema from "./utils/mutateCTBContentTypeSchema";
import { getTrad } from "./utils";
import addColumnToTableHook from "./contentManagerHooks/addColumnToTable";

const prefixPluginTranslations = (data, pluginId) => {
  if (!data) return {};
  return Object.keys(data).reduce((acc, current) => {
    acc[`${pluginId}.${current}`] = data[current];
    return acc;
  }, {});
};

const name = pluginPkg.strapi.name;

export default {
  register(app) {
    app.addMiddlewares(middlewares);

    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: false,
      name,
    });
  },

  bootstrap(app) {
    const cmPlugin = app.getPlugin("content-manager");
    if (cmPlugin?.apis?.addEditViewSidePanel) {
      cmPlugin.apis.addEditViewSidePanel([VersionsSidePanel || Versions]);
    } else if (cmPlugin && cmPlugin.injectComponent) {
      cmPlugin.injectComponent("editView", "right-links", {
        name: "revisions-action",
        Component: Versions,
      });
    }

    // Hook that adds a column into the CM's LV table
    if (typeof app.registerHook === "function") {
      try {
        app.registerHook(
          "Admin/CM/pages/ListView/inject-column-in-table",
          addColumnToTableHook
        );
      } catch (err) {}
    }

    const ctbPlugin = app.getPlugin("content-type-builder");

    if (ctbPlugin && ctbPlugin.apis && ctbPlugin.apis.forms) {
      try {
        const ctbFormsAPI = ctbPlugin.apis.forms;
        ctbFormsAPI.addContentTypeSchemaMutation(mutateCTBContentTypeSchema);
        ctbFormsAPI.components.add({
          id: "checkboxConfirmation",
          component: CheckboxConfirmation,
        });

      ctbFormsAPI.extendContentType({
        validator: () => ({
          versions: yup.object().shape({
            versioned: yup.bool(),
          }),
        }),
        form: {
          advanced() {
            return [
              {
                name: "pluginOptions.versions.versioned",
                description: {
                  id: getTrad(
                    "plugin.schema.versions.versioned.description-content-type"
                  ),
                  defaultMessage: "Allow you to keep older versions of content",
                },
                type: "checkboxConfirmation",
                intlLabel: {
                  id: getTrad(
                    "plugin.schema.versions.versioned.label-content-type"
                  ),
                  defaultMessage: "Enable versioning for this Content-Type",
                },
              },
            ];
          },
        },
      });
      } catch (err) {}
    }
  },
  async registerTrads({ locales }) {
    const importedTrads = await Promise.all(
      locales.map((locale) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            return {
              data: prefixPluginTranslations(data, pluginId),
              locale,
            };
          })
          .catch(() => {
            return {
              data: {},
              locale,
            };
          });
      })
    );

    return Promise.resolve(importedTrads);
  },
};
